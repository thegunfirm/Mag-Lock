import { Express } from 'express';
import { LocalAuthService } from './local-auth-service.js';
import { z } from 'zod';

const localAuthService = new LocalAuthService();

// Export the service instance and schema for reuse
export { localAuthService };

// Validation schemas
export const registrationSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
  phone: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

/**
 * Authentication middleware for local users
 */
export function requireLocalAuth(req: any, res: any, next: any) {
  if (req.session?.user?.id) {
    return next();
  }
  return res.status(401).json({ message: 'Authentication required' });
}

/**
 * Register local authentication routes
 */
export function registerLocalAuthRoutes(app: Express) {
  
  // POST /api/auth/register - Start registration process
  app.post('/api/auth/register', async (req, res) => {
    try {
      const validatedData = registrationSchema.parse(req.body);
      
      console.log('🔄 Processing registration for:', validatedData.email);
      const result = await localAuthService.initiateRegistration(validatedData);
      
      res.json(result);
      
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed',
          errors: error.errors
        });
      }
      res.status(500).json({ 
        success: false, 
        message: 'Registration failed. Please try again.' 
      });
    }
  });

  // GET /verify-email?token=... - Verify email and create account (email link handler)
  app.get('/verify-email', async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.redirect('/login?error=invalid_token');
      }
      
      const result = await localAuthService.verifyEmailAndCreateAccount(token);
      
      if (result.success && result.user) {
        // Set session (no tier - user will select tier next)
        req.session.userId = result.user.id;  // Set userId for /api/me compatibility
        req.session.user = {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          roles: [],
          loginMethod: 'local',
          loginTime: new Date()
        };
        
        console.log('✅ User account created and logged in:', result.user.email);
        console.log('🔄 Redirecting to tier selection page');
        
        // Redirect to tier selection page after successful verification
        return res.redirect('/select-tier');
      } else {
        console.log('❌ Email verification failed:', result.error);
        return res.redirect('/login?error=verification_failed');
      }
      
    } catch (error: any) {
      console.error('Email verification error:', error);
      return res.redirect('/login?error=verification_error');
    }
  });

  // POST /api/auth/verify-email - Verify email and create account (API)
  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ 
          success: false, 
          error: 'Verification token is required' 
        });
      }

      const result = await localAuthService.verifyEmailAndCreateAccount(token);
      
      if (result.success && result.user) {
        // Set session (no tier - user will select tier next)
        req.session.userId = result.user.id;  // Set userId for /api/me compatibility
        req.session.user = {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          roles: [],
          loginMethod: 'local',
          loginTime: new Date()
        };
        
        res.json({ 
          success: true, 
          message: 'Email verified and account created successfully',
          user: result.user
        });
      } else {
        res.status(400).json(result);
      }
      
    } catch (error: any) {
      console.error('Email verification error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Email verification failed. Please try again.' 
      });
    }
  });

  // POST /api/auth/test-register - Create test user (bypassing email verification)
  app.post('/api/auth/test-register', async (req, res) => {
    try {
      const validatedData = registrationSchema.parse(req.body);
      
      console.log('🧪 Creating test user:', validatedData.email);
      const result = await localAuthService.createTestUser(validatedData);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Test user created successfully in local database',
          user: result.user,
          localUserId: result.localUserId
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: result.error || 'Test user creation failed' 
        });
      }
      
    } catch (error: any) {
      console.error('Test registration error:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed',
          errors: error.errors
        });
      }
      res.status(500).json({ 
        success: false, 
        message: 'Test user creation failed. Please try again.' 
      });
    }
  });

  // GET /api/auth/zoho-debug - Debug Zoho CRM field names
  app.get('/api/auth/zoho-debug', async (req, res) => {
    try {
      const zohoConfig = {
        clientId: process.env.ZOHO_CLIENT_ID || '',
        clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
        redirectUri: process.env.ZOHO_REDIRECT_URI || '',
        accountsHost: process.env.ZOHO_ACCOUNTS_HOST || 'https://accounts.zoho.com',
        apiHost: process.env.ZOHO_CRM_BASE || 'https://www.zohoapis.com/crm/v2',
        accessToken: process.env.ZOHO_ACCESS_TOKEN,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN
      };
      const zohoService = new (await import('./zoho-service')).ZohoService(zohoConfig);
      
      // Test basic Zoho Contact creation without custom fields
      const testContactData = {
        Email: 'field.test@thegunfirm.com',
        First_Name: 'Field',
        Last_Name: 'Test',
        Lead_Source: 'API Test'
      };
      
      console.log('🧪 Testing basic Zoho Contact creation...');
      const result = await zohoService.createContact(testContactData);
      
      res.json({
        success: result.success,
        message: 'Zoho field test completed',
        details: result
      });
      
    } catch (error: any) {
      console.error('Zoho debug error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error
      });
    }
  });

  // POST /api/auth/login - User login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      console.log('🔐 Processing login for:', validatedData.email);
      const result = await localAuthService.loginUser(validatedData.email, validatedData.password);
      
      if (result.success) {
        // Set session (no membershipTier in session - fetched from DB via /api/me)
        req.session.userId = result.id!; // Set userId for /api/membership/upgrade compatibility
        req.session.user = {
          id: result.id!,
          email: result.email!,
          firstName: result.firstName!,
          lastName: result.lastName!,
          roles: [],
          loginMethod: 'local',
          loginTime: new Date()
        };

        // Return user data (membershipTier still in response for client)
        res.json({
          success: true,
          id: result.id!,
          email: result.email!,
          firstName: result.firstName!,
          lastName: result.lastName!,
          membershipTier: result.membershipTier!
        });
      } else {
        res.status(401).json(result);
      }
      
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid email or password format'
        });
      }
      res.status(500).json({ 
        success: false, 
        error: 'Login failed. Please try again.' 
      });
    }
  });

  // POST /api/auth/logout - User logout
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Logged out successfully' });
    });
  });

  // GET /api/me - Get current user
  app.get('/api/me', requireLocalAuth, async (req, res) => {
    try {
      const userId = req.session!.user!.id;
      const user = await localAuthService.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        membershipTier: user.membershipTier,
        emailVerified: user.emailVerified,
        lifetimeSavings: user.lifetimeSavings,
        role: user.role
      });
      
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({ message: 'Failed to get user information' });
    }
  });

  // POST /api/auth/update-tier - Update user membership tier
  app.post('/api/auth/update-tier', async (req, res) => {
    try {
      const { userId, membershipTier, email } = req.body;
      
      let success = false;
      
      if (userId) {
        success = await localAuthService.updateUserMembershipTier(userId, membershipTier);
      } else if (email) {
        success = await localAuthService.updateUserTierByEmail(email, membershipTier);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Either userId or email is required' 
        });
      }
      
      if (success) {
        // Note: Session is not updated - client should refetch /api/me for latest tier
        res.json({ 
          success: true, 
          message: 'Membership tier updated successfully' 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: 'Failed to update membership tier' 
        });
      }
      
    } catch (error: any) {
      console.error('Update tier error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update membership tier' 
      });
    }
  });

  // POST /api/auth/resend-verification - Resend verification email
  app.post('/api/auth/resend-verification', async (req, res) => {
    try {
      const { email, token } = req.body;
      const sessionEmail = req.session?.user?.email;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      
      console.log('🔄 Resend verification request from IP:', clientIp);
      
      const result = await localAuthService.resendVerificationEmail({
        email,
        token,
        sessionEmail,
        clientIp
      });
      
      // Always return 200 with the same message to prevent enumeration
      res.json(result);
      
    } catch (error: any) {
      console.error('Resend verification error:', error);
      // Return success even on error to prevent enumeration
      res.json({ 
        success: true, 
        message: 'If an account exists with that email, a verification email has been sent.' 
      });
    }
  });

}