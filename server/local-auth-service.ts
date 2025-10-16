import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { db } from './db.js';
import { localUsers, users } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { ZohoService } from './zoho-service.js';

export type User = typeof localUsers.$inferSelect;
export type InsertUser = typeof localUsers.$inferInsert;

export interface RegistrationData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  phone?: string;
}

export interface VerificationResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    isTestAccount?: boolean;
  };
  error?: string;
  message?: string;
  localUserId?: string;
}

export interface LoginResult {
  success: boolean;
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  membershipTier?: string;
  error?: string;
}

/**
 * Local Authentication Service
 * Handles user registration, login, and management using local PostgreSQL database
 * Replaces Zoho CRM dependency with reliable local storage
 */
export class LocalAuthService {
  private pendingRegistrations = new Map<string, RegistrationData & { expiresAt: Date; verificationToken: string }>();
  private zohoService: ZohoService;
  
  // Rate limiting for resend verification
  private ipRateLimit = new Map<string, { count: number; lastReset: Date }>();
  private emailRateLimit = new Map<string, { count: number; lastRequest: Date }>();

  constructor() {
    // Initialize Zoho service for Contact module updates with environment credentials
    const zohoConfig = {
      clientId: process.env.ZOHO_CLIENT_ID || '',
      clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
      redirectUri: process.env.ZOHO_REDIRECT_URI || '',
      accountsHost: process.env.ZOHO_ACCOUNTS_HOST || 'https://accounts.zoho.com',
      apiHost: process.env.ZOHO_CRM_BASE || 'https://www.zohoapis.com/crm/v2',
      accessToken: process.env.ZOHO_ACCESS_TOKEN,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN
    };
    
    this.zohoService = new ZohoService(zohoConfig);
  }

  /**
   * Step 1: Initiate registration with email verification
   */
  async initiateRegistration(data: RegistrationData): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Initiating local registration for:', data.email);

      // Check if user already exists
      const existingUser = await db.select().from(localUsers).where(eq(localUsers.email, data.email)).limit(1);
      if (existingUser.length > 0) {
        const user = existingUser[0];
        // Check if the user has already verified their email
        if (user.emailVerified) {
          return { 
            success: false, 
            message: 'You already have an account. Please sign in to continue.',
            redirectToLogin: true,
            accountExists: true
          };
        } else {
          // Account exists but not verified yet
          return { 
            success: false, 
            message: 'An account with this email exists but is not verified. Please check your email for the verification link.',
            accountExists: true,
            needsVerification: true
          };
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 12);

      // Generate verification token
      const verificationToken = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store in database for persistence across server restarts
      const userData: InsertUser = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: hashedPassword,
        phone: data.phone,
        membershipTier: undefined, // No tier until payment
        emailVerified: false,
        emailVerificationToken: verificationToken,
        // Note: No expiry field in schema, we'll check expiry based on creation time
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log('Creating unverified user in database with verification token');
      await db.insert(localUsers).values(userData);

      // Also keep in memory for backward compatibility
      this.pendingRegistrations.set(verificationToken, {
        ...data,
        password: hashedPassword,
        expiresAt,
        verificationToken
      });

      // Send verification email using SendGrid
      await this.sendVerificationEmail(data.email, verificationToken);
      
      console.log('✅ Verification email sent to:', data.email);
      return { 
        success: true, 
        message: 'Registration initiated. Please check your email to verify your account.' 
      };

    } catch (error) {
      console.error('Registration initiation error:', error);
      return { 
        success: false, 
        message: 'Registration failed. Please try again.' 
      };
    }
  }

  /**
   * Step 2: Verify email and create local user account
   */
  async verifyEmailAndCreateAccount(token: string): Promise<VerificationResult> {
    try {
      console.log('🔄 Verifying email token:', token);
      
      // Check localUsers table for existing user with this token
      const existingLocalUser = await db.select()
        .from(localUsers)
        .where(eq(localUsers.emailVerificationToken, token))
        .limit(1);
      
      console.log(`🔍 Database query returned ${existingLocalUser.length} local users`);
      
      if (existingLocalUser.length > 0) {
        console.log('📝 Found existing user in localUsers table with token');
        const user = existingLocalUser[0];
        
        // Check if token has expired (24 hours from creation)
        if (user.createdAt && new Date() > new Date(user.createdAt.getTime() + 24 * 60 * 60 * 1000)) {
          console.log('⏰ Token has expired for:', user.email);
          return { success: false, error: 'Verification token has expired' };
        }
        
        // Verify the user's email
        console.log('📧 Marking email as verified for:', user.email);
        await db.update(localUsers)
          .set({
            emailVerified: true,
            emailVerifiedAt: new Date(),
            emailVerificationToken: null,
            updatedAt: new Date()
          })
          .where(eq(localUsers.id, user.id));
        
        console.log('✅ Email verification completed for:', user.email);
        
        return {
          success: true,
          user: {
            id: user.id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            subscriptionTier: user.membershipTier,
            emailVerified: true
          }
        };
      }
      
      // Fall back to memory-based pending registration (for backward compatibility)
      const pendingUser = this.pendingRegistrations.get(token);
      if (!pendingUser) {
        return { success: false, error: 'Invalid or expired verification token' };
      }

      // Check expiration
      if (new Date() > pendingUser.expiresAt) {
        this.pendingRegistrations.delete(token);
        return { success: false, error: 'Verification token has expired' };
      }

      // User already exists in DB from initiateRegistration, just update verification status
      const [existingUser] = await db.update(localUsers)
        .set({
          emailVerified: true,
          emailVerifiedAt: new Date(),
          emailVerificationToken: null,
          updatedAt: new Date()
        })
        .where(eq(localUsers.email, pendingUser.email))
        .returning();

      // Clean up pending registration
      this.pendingRegistrations.delete(token);

      if (!existingUser) {
        return { success: false, error: 'User account not found' };
      }

      console.log('✅ Local account verified in pending_payment state:', {
        email: existingUser.email,
        localId: existingUser.id,
        selectedTier: 'none'
      });

      // Create/Update Zoho CRM Contact with email verification status
      try {
        console.log('🔄 Creating/Updating Zoho Contact with verification status...');
        
        // First try to create the Contact (includes Tier and basic info)
        // Convert timestamp to Zoho's required datetime format: yyyy-MM-ddTHH:mm:ss
        const verificationTimestamp = new Date();
        const zohoDateTime = verificationTimestamp.toISOString().replace(/\.\d{3}Z$/, '');
        
        console.log('🔍 Email verification fields for Zoho:');
        console.log('  - Email_Verified: true');
        console.log('  - Email_Opt_Out: false');
        console.log('  - Verification Time (Zoho format):', zohoDateTime);
        
        // Include all required email verification fields for Zoho CRM
        const contactData = {
          Email: existingUser.email,
          First_Name: existingUser.firstName,
          Last_Name: existingUser.lastName,
          Phone: existingUser.phone || '',
          Lead_Source: 'Website Registration',
          Account_Name: 'TheGunFirm Customer',
          Tier: 'Bronze', // Default for initial Zoho contact creation
          'Email_Verified': true, // Custom Email Verified checkbox ✅
          'Email_Verification_Time_Stamp': zohoDateTime, // Custom DateTime field ✅
          'Email_Opt_Out': false // Custom checkbox field (default to not opted out) ✅
        };
        
        const zohoContactResult = await this.zohoService.createContact(contactData);
        
        if (zohoContactResult.success) {
          console.log('✅ Zoho Contact created with email verification status');
        } else {
          console.log('⚠️ Zoho Contact creation failed, trying update instead...');
          
          // If creation failed (possibly duplicate), try updating existing Contact
          const zohoUpdateResult = await this.zohoService.updateContactEmailVerification(
            existingUser.email,
            verificationTimestamp
          );
          
          if (zohoUpdateResult.success) {
            console.log('✅ Zoho Contact email verification updated successfully');
          } else {
            console.log('⚠️ Zoho Contact update also failed:', zohoUpdateResult.error);
          }
        }
      } catch (error) {
        console.error('⚠️ Error with Zoho Contact operations:', error);
        // Don't fail the overall process if Zoho operations fail
      }

      return {
        success: true,
        user: {
          id: existingUser.id,
          email: existingUser.email!,
          firstName: existingUser.firstName!,
          lastName: existingUser.lastName!,
          // subscriptionTier removed - not part of VerificationResult type
          emailVerified: true
          // selectedTier removed - not part of VerificationResult type
        },
        message: 'Email verified - please complete payment',
        // accountStatus and selectedTier removed - not part of VerificationResult type
        localUserId: existingUser.id
      };
      
    } catch (error) {
      console.error('Email verification error:', error);
      return { success: false, error: 'Email verification failed' };
    }
  }

  /**
   * Create test user (bypasses email verification for testing)
   */
  async createTestUser(data: RegistrationData): Promise<VerificationResult> {
    try {
      console.log('🧪 Creating test user locally (bypassing email verification):', data.email);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 12);
      
      // Create user directly in local database
      const userData: InsertUser = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: hashedPassword,
        phone: data.phone,
        membershipTier: undefined, // No auto-assignment - user selects tier later
        emailVerified: true,
        isActive: true,
        isTestAccount: true,
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const [newUser] = await db.insert(localUsers).values(userData).returning();
      
      console.log('✅ Test user created locally with ID:', newUser.id);
      
      // Create corresponding Zoho Contact with Tier field
      try {
        await this.createZohoContact(newUser);
        console.log('✅ Zoho Contact created with Tier field');
      } catch (error) {
        console.log('⚠️ Zoho Contact creation failed, but local user created:', error);
      }
      
      return {
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email!,
          firstName: newUser.firstName!,
          lastName: newUser.lastName!,
          // subscriptionTier removed - user will select tier after verification
          emailVerified: true,
          isTestAccount: true
        },
        localUserId: newUser.id
      };
      
    } catch (error: any) {
      console.error('❌ Test user creation error:', error);
      return { 
        success: false, 
        error: error?.message || 'Test user creation failed' 
      };
    }
  }

  /**
   * Login user with email and password
   */
  async loginUser(email: string, password: string): Promise<LoginResult> {
    try {
      console.log('🔐 Local login attempt for:', email);
      
      // Find user in local database
      const [user] = await db.select().from(localUsers).where(eq(localUsers.email, email)).limit(1);
      
      if (!user) {
        return { success: false, error: 'Invalid email or password' };
      }

      if (!user.isActive) {
        return { success: false, error: 'Account is deactivated. Please contact support.' };
      }

      if (!user.emailVerified) {
        return { success: false, error: 'Please verify your email before logging in.' };
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.passwordHash!);
      if (!passwordMatch) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Update last login
      await db.update(localUsers).set({ 
        lastLogin: new Date(),
        updatedAt: new Date()
      }).where(eq(localUsers.id, user.id));

      console.log('✅ Local login successful for:', email);
      
      return {
        success: true,
        id: user.id,
        email: user.email!,
        firstName: user.firstName!,
        lastName: user.lastName!,
        membershipTier: user.membershipTier!
      };

    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  }

  /**
   * Get user by local ID
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      const [user] = await db.select().from(localUsers).where(eq(localUsers.id, id)).limit(1);
      return user || null;
    } catch (error) {
      console.error('Get user by ID error:', error);
      return null;
    }
  }

  /**
   * Update user membership tier
   */
  async updateUserMembershipTier(userId: string, membershipTier: string): Promise<boolean> {
    try {
      await db.update(localUsers).set({ 
        membershipTier,
        updatedAt: new Date()
      }).where(eq(localUsers.id, userId));

      console.log(`✅ Updated membership tier for ${userId} to ${membershipTier}`);
      return true;

    } catch (error) {
      console.error('Update membership tier error:', error);
      return false;
    }
  }

  /**
   * Update user tier by email (for subscription processing)
   */
  async updateUserTierByEmail(email: string, membershipTier: string): Promise<boolean> {
    try {
      await db.update(localUsers).set({ 
        membershipTier,
        updatedAt: new Date()
      }).where(eq(localUsers.email, email));

      console.log(`✅ Updated membership tier for ${email} to ${membershipTier}`);
      
      // Update Zoho Contact Tier field
      try {
        await this.updateZohoContactTier(email, membershipTier);
      } catch (error) {
        console.log('⚠️ Zoho Contact tier update failed, but local update succeeded:', error);
      }
      
      return true;

    } catch (error) {
      console.error('Update tier by email error:', error);
      return false;
    }
  }

  /**
   * Create Zoho Contact with Tier field
   */
  private async createZohoContact(user: User): Promise<void> {
    try {
      const contactData = {
        data: [{
          First_Name: user.firstName,
          Last_Name: user.lastName,
          Email: user.email,
          Phone: user.phone || null,
          Tier: user.membershipTier, // This is the key field for the test
          Account_Name: 'TheGunFirm Customer',
          Lead_Source: 'Website Registration'
        }]
      };

      const result = await this.zohoService.makeAPIRequest('Contacts', 'POST', contactData);
      console.log('Zoho Contact creation result:', result?.data?.[0]?.status);
    } catch (error) {
      console.error('Zoho Contact creation error:', error);
      throw error;
    }
  }

  /**
   * Update Zoho Contact Tier field
   */
  private async updateZohoContactTier(email: string, newTier: string): Promise<void> {
    try {
      // Search for the contact by email
      const searchResponse = await this.zohoService.makeAPIRequest(
        `Contacts/search?email=${encodeURIComponent(email)}`
      );

      if (searchResponse?.data?.[0]?.id) {
        const contactId = searchResponse.data[0].id;
        
        const updateData = {
          data: [{
            id: contactId,
            Tier: newTier
          }]
        };

        await this.zohoService.makeAPIRequest('Contacts', 'PUT', updateData);
        console.log(`✅ Updated Zoho Contact Tier to ${newTier} for ${email}`);
      }
    } catch (error) {
      console.error('Zoho Contact tier update error:', error);
      throw error;
    }
  }

  /**
   * Rate limiting helper methods
   */
  private isRateLimited(ip: string, email: string): boolean {
    const now = new Date();
    
    // Check IP rate limit (5 per hour, burst 3)
    const ipData = this.ipRateLimit.get(ip);
    if (ipData) {
      const hoursSinceReset = (now.getTime() - ipData.lastReset.getTime()) / (1000 * 60 * 60);
      if (hoursSinceReset >= 1) {
        // Reset hourly limit
        this.ipRateLimit.set(ip, { count: 1, lastReset: now });
      } else if (ipData.count >= 5) {
        return true; // IP rate limited
      } else {
        ipData.count++;
      }
    } else {
      this.ipRateLimit.set(ip, { count: 1, lastReset: now });
    }

    // Check email rate limit (3 per hour, minimum 60s cooldown)
    const emailData = this.emailRateLimit.get(email);
    if (emailData) {
      const minutesSinceLastRequest = (now.getTime() - emailData.lastRequest.getTime()) / (1000 * 60);
      if (minutesSinceLastRequest < 1) {
        return true; // Too soon since last request
      }
      if (emailData.count >= 3) {
        return true; // Email rate limited
      } else {
        emailData.count++;
        emailData.lastRequest = now;
      }
    } else {
      this.emailRateLimit.set(email, { count: 1, lastRequest: now });
    }

    return false;
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(params: { 
    email?: string; 
    token?: string; 
    sessionEmail?: string;
    clientIp: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Processing resend verification request');
      
      let targetEmail: string | null = null;

      // Determine target email with security priority
      if (params.sessionEmail) {
        // User is logged in, use their session email (ignore provided email)
        targetEmail = params.sessionEmail;
      } else if (params.token) {
        // Try to resolve email from token (DB first, then memory)
        const dbUser = await db.select()
          .from(users)
          .where(eq(users.emailVerificationToken, params.token))
          .limit(1);
          
        if (dbUser.length > 0 && !dbUser[0].emailVerified) {
          targetEmail = dbUser[0].email;
        } else {
          // Check pending registrations
          const pendingUser = this.pendingRegistrations.get(params.token);
          if (pendingUser) {
            targetEmail = pendingUser.email;
          }
        }
      } else if (params.email) {
        // Use provided email (least trusted)
        targetEmail = params.email;
      }

      if (!targetEmail) {
        // Always return success to prevent enumeration
        return { 
          success: true, 
          message: 'If an account exists with that email, a verification email has been sent.' 
        };
      }

      // Check rate limiting
      if (this.isRateLimited(params.clientIp, targetEmail)) {
        // Return success to prevent enumeration, but don't send email
        console.log('⚠️ Rate limited resend request from', params.clientIp, 'for', targetEmail);
        return { 
          success: true, 
          message: 'If an account exists with that email, a verification email has been sent.' 
        };
      }

      // Check if user is already verified
      const existingLocalUser = await db.select()
        .from(localUsers)
        .where(eq(localUsers.email, targetEmail))
        .limit(1);
        
      if (existingLocalUser.length > 0 && existingLocalUser[0].emailVerified) {
        // Already verified, return success but don't send
        return { 
          success: true, 
          message: 'If an account exists with that email, a verification email has been sent.' 
        };
      }

      // Check database users table for unverified users
      const dbUser = await db.select()
        .from(users)
        .where(eq(users.email, targetEmail))
        .limit(1);
        
      if (dbUser.length > 0 && !dbUser[0].emailVerified) {
        // Generate new token and update DB
        const newToken = randomUUID();
        await db.update(users)
          .set({ emailVerificationToken: newToken })
          .where(eq(users.email, targetEmail));
          
        // Send verification email
        await this.sendVerificationEmailResend(targetEmail, newToken);
        console.log('✅ Resent verification email for DB user:', targetEmail);
        
        return { 
          success: true, 
          message: 'If an account exists with that email, a verification email has been sent.' 
        };
      }

      // Check pending registrations
      let foundPendingRegistration = false;
      for (const [token, registration] of Array.from(this.pendingRegistrations.entries())) {
        if (registration.email === targetEmail) {
          // Generate new token, copy registration with extended expiry
          const newToken = randomUUID();
          const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
          
          this.pendingRegistrations.set(newToken, {
            ...registration,
            expiresAt: newExpiry,
            verificationToken: newToken
          });
          
          // Remove old token
          this.pendingRegistrations.delete(token);
          
          // Send verification email
          await this.sendVerificationEmailResend(targetEmail, newToken);
          console.log('✅ Resent verification email for pending registration:', targetEmail);
          
          foundPendingRegistration = true;
          break;
        }
      }

      // Always return success message to prevent enumeration
      return { 
        success: true, 
        message: 'If an account exists with that email, a verification email has been sent.' 
      };
      
    } catch (error) {
      console.error('Resend verification error:', error);
      // Still return success to prevent enumeration
      return { 
        success: true, 
        message: 'If an account exists with that email, a verification email has been sent.' 
      };
    }
  }

  /**
   * Send verification email (for registration)
   */
  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    try {
      const { sendVerificationEmail } = await import('./services/email-service.js');
      
      // Extract firstName from pending registration if available
      const pendingUser = this.pendingRegistrations.get(token);
      const firstName = pendingUser?.firstName || 'User';
      
      await sendVerificationEmail(email, firstName, token);
      console.log(`📧 Verification email sent to: ${email} with token: ${token.substring(0, 8)}...`);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      throw error;
    }
  }

  /**
   * Send verification email helper (for resend)
   */
  private async sendVerificationEmailResend(email: string, token: string): Promise<void> {
    try {
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/verify-email?token=${token}`;
      
      // TODO: Integrate with SendGrid for production
      // For now, log the verification URL (dev mode)
      console.log(`📧 Verification email for ${email}: ${verificationUrl}`);
      
      // In production, send actual email via SendGrid
      if (process.env.NODE_ENV === 'production' && process.env.SENDGRID_API_KEY_ID) {
        // Implement SendGrid email sending here
        console.log('📧 Would send verification email via SendGrid in production');
      }
    } catch (error) {
      console.error('Send verification email error:', error);
      throw error;
    }
  }
}