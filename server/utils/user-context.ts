import { db } from '../db';
import { localUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DatabaseStorage } from '../storage';

// Helper to check if this is a local user ID
export function isLocalUserId(id: any): boolean {
  return typeof id === 'string' && id.startsWith('local-');
}

// Get user context from session
export function getSessionUserContext(req: any) {
  const sessionId = req.session?.userId;
  if (!sessionId) return null;
  
  return {
    kind: isLocalUserId(sessionId) ? 'local' : 'legacy',
    sessionId,
    email: req.session?.email || null,
    legacyId: isLocalUserId(sessionId) ? null : parseInt(sessionId)
  };
}

// Get current user (unified interface for both local and legacy)
export async function getCurrentUser(ctx: any, storage: DatabaseStorage) {
  if (!ctx) return null;
  
  if (ctx.kind === 'local') {
    // Fetch from localUsers table
    const results = await db.select()
      .from(localUsers)
      .where(eq(localUsers.id, ctx.sessionId))
      .limit(1);
    
    if (results.length === 0) return null;
    
    const localUser = results[0];
    return {
      id: localUser.id,
      email: localUser.email,
      firstName: localUser.firstName,
      lastName: localUser.lastName,
      subscriptionTier: localUser.membershipTier,
      intendedTier: null, // Local users don't have this field
      membershipStatus: localUser.membershipPaid ? 'active' : 'pending_payment',
      emailVerified: localUser.emailVerified,
      membershipPaid: localUser.membershipPaid
    };
  } else {
    // Use storage for legacy users
    return await storage.getUser(ctx.legacyId);
  }
}

// Update user (handles both local and legacy)
export async function updateUserSmart(ctx: any, updates: any, storage: DatabaseStorage) {
  if (!ctx) throw new Error('No user context provided');
  
  if (ctx.kind === 'local') {
    // Update localUsers table
    const mappedUpdates: any = {};
    
    // Map common fields
    if (updates.subscriptionTier !== undefined) mappedUpdates.membershipTier = updates.subscriptionTier;
    if (updates.membershipPaid !== undefined) mappedUpdates.membershipPaid = updates.membershipPaid;
    if (updates.firstName !== undefined) mappedUpdates.firstName = updates.firstName;
    if (updates.lastName !== undefined) mappedUpdates.lastName = updates.lastName;
    
    // For local users, we don't have intendedTier or membershipStatus columns
    // These are handled in application logic only
    
    // Only update if we have fields to update
    if (Object.keys(mappedUpdates).length > 0) {
      await db.update(localUsers)
        .set(mappedUpdates)
        .where(eq(localUsers.id, ctx.sessionId));
    }
    
    return true;
  } else {
    // Use storage for legacy users
    return await storage.updateUser(ctx.legacyId, updates);
  }
}

// Update user tier (handles both local and legacy)
export async function updateUserTierSmart(ctx: any, tier: string, storage: DatabaseStorage) {
  if (!ctx) throw new Error('No user context provided');
  
  if (ctx.kind === 'local') {
    // Update localUsers table
    await db.update(localUsers)
      .set({ 
        membershipTier: tier,
        membershipPaid: tier !== 'Bronze' // Bronze is free, others are paid
      })
      .where(eq(localUsers.id, ctx.sessionId));
    
    return true;
  } else {
    // Use storage for legacy users
    return await storage.updateUserTier(ctx.legacyId, tier);
  }
}