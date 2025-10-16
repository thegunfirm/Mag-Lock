import { Router } from 'express';
import { db } from '../db';
import { 
  stateComplianceConfig,
  complianceAttemptLogs 
} from '@shared/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { stateComplianceService } from '../state-compliance-service';

const router = Router();

/**
 * Get current compliance configuration
 */
router.get('/config', async (req, res) => {
  try {
    const config = await stateComplianceService.getComplianceConfig();
    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Error getting compliance config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update compliance configuration (admin only)
 */
router.put('/config', async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    const sessionUser = (req.session as any)?.user;
    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check if user is admin
    if (sessionUser.role !== 'admin' && sessionUser.role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const { 
      blockedStates,
      magazineLimits,
      blockAmmoStates,
      assaultWeaponBlockedStates,
      rosterStates 
    } = req.body;

    // Convert string user ID to numeric for storage
    const adminUserId = sessionUser.id ? parseInt(sessionUser.id.replace(/\D/g, '').slice(0, 9)) || 1 : 1;
    
    await stateComplianceService.updateComplianceConfig({
      blockedStates,
      magazineLimits,
      blockAmmoStates,
      assaultWeaponBlockedStates,
      rosterStates
    }, adminUserId);

    res.json({
      success: true,
      message: 'Compliance configuration updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating compliance config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get compliance attempt logs (admin only)
 */
router.get('/attempts', async (req, res) => {
  try {
    // Check if user is authenticated and is admin/manager/support
    const sessionUser = (req.session as any)?.user;
    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (sessionUser.role !== 'admin' && sessionUser.role !== 'manager' && sessionUser.role !== 'support') {
      return res.status(403).json({
        success: false,
        error: 'Staff access required'
      });
    }
    const { 
      startDate,
      endDate,
      state,
      attemptType,
      page = '1',
      limit = '50'
    } = req.query;

    let query = db.select().from(complianceAttemptLogs);
    
    // Apply filters
    const conditions = [];
    if (state) {
      conditions.push(eq(complianceAttemptLogs.shipState, state as string));
    }
    if (attemptType) {
      conditions.push(eq(complianceAttemptLogs.attemptType, attemptType as string));
    }
    if (startDate) {
      conditions.push(gte(complianceAttemptLogs.timestamp, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(complianceAttemptLogs.timestamp, new Date(endDate as string)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Order by most recent first
    query = query.orderBy(desc(complianceAttemptLogs.timestamp));

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    query = query.limit(limitNum).offset((pageNum - 1) * limitNum);

    const attempts = await query;

    res.json({
      success: true,
      attempts,
      page: pageNum,
      limit: limitNum
    });
  } catch (error: any) {
    console.error('Error getting compliance attempts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get compliance attempt statistics (admin only)
 */
router.get('/stats', async (req, res) => {
  try {
    // Check if user is authenticated and is admin/manager/support
    const sessionUser = (req.session as any)?.user;
    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (sessionUser.role !== 'admin' && sessionUser.role !== 'manager' && sessionUser.role !== 'support') {
      return res.status(403).json({
        success: false,
        error: 'Staff access required'
      });
    }
    const { startDate, endDate } = req.query;

    // Build date conditions
    const conditions = [];
    if (startDate) {
      conditions.push(gte(complianceAttemptLogs.timestamp, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(complianceAttemptLogs.timestamp, new Date(endDate as string)));
    }

    // Get all attempts in date range
    let query = db.select().from(complianceAttemptLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    const attempts = await query;

    // Calculate statistics
    const stats = {
      totalAttempts: attempts.length,
      byState: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byReasonCode: {} as Record<string, number>,
      topBlockedSkus: [] as Array<{ sku: string; count: number; reasons: string[] }>
    };

    // Process attempts for statistics
    const skuMap = new Map<string, { count: number; reasons: Set<string> }>();

    for (const attempt of attempts) {
      // Count by state
      stats.byState[attempt.shipState] = (stats.byState[attempt.shipState] || 0) + 1;
      
      // Count by type
      stats.byType[attempt.attemptType] = (stats.byType[attempt.attemptType] || 0) + 1;
      
      // Process blocked SKUs
      const blockedSkus = attempt.blockedSkus as Array<{ sku: string; reasonCode: string }>;
      for (const blocked of blockedSkus) {
        // Count by reason code
        stats.byReasonCode[blocked.reasonCode] = (stats.byReasonCode[blocked.reasonCode] || 0) + 1;
        
        // Track SKU statistics
        if (!skuMap.has(blocked.sku)) {
          skuMap.set(blocked.sku, { count: 0, reasons: new Set() });
        }
        const skuData = skuMap.get(blocked.sku)!;
        skuData.count++;
        skuData.reasons.add(blocked.reasonCode);
      }
    }

    // Convert SKU map to sorted array (top 10)
    stats.topBlockedSkus = Array.from(skuMap.entries())
      .map(([sku, data]) => ({
        sku,
        count: data.count,
        reasons: Array.from(data.reasons)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('Error getting compliance stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export function registerStateComplianceRoutes(app: any) {
  app.use('/api/compliance', router);
}