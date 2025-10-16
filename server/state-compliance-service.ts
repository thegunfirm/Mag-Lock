import { db } from './db';
import { 
  products, 
  stateComplianceConfig,
  complianceAttemptLogs 
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface ComplianceConfig {
  blockedStates: string[];
  magazineLimits: Record<string, number>;
  blockAmmoStates: string[];
  assaultWeaponBlockedStates: string[];
  rosterStates: Record<string, string>;
}

interface ComplianceCheckResult {
  allowed: boolean;
  reasonCode?: string;
  reasonText?: string;
  complianceFlags?: string[];
}

interface Product {
  id: number;
  sku: string | null;
  name: string;
  isFirearm: boolean;
  isHandgun?: boolean | null;
  isSemiAuto?: boolean | null;
  capacity?: number | null;
  hasAssaultFeatures?: boolean | null;
  handgunRosterId?: string | null;
  isAmmo?: boolean | null;
  isMagazine?: boolean | null;
  requiresFFL?: boolean | null;
}

export class StateComplianceService {
  private config: ComplianceConfig | null = null;

  /**
   * Load compliance configuration from database
   */
  private async loadConfig(): Promise<ComplianceConfig> {
    if (this.config) {
      return this.config;
    }

    const configRows = await db
      .select()
      .from(stateComplianceConfig)
      .where(eq(stateComplianceConfig.isActive, true))
      .limit(1);

    if (configRows.length === 0) {
      // Default configuration if none exists
      this.config = {
        blockedStates: ['CA'],
        magazineLimits: { NY: 10, MA: 10, IL: 10 },
        blockAmmoStates: ['NY'],
        assaultWeaponBlockedStates: ['NY', 'IL'],
        rosterStates: { MA: 'MA_HANDGUN_ROSTER' }
      };
    } else {
      const configRow = configRows[0];
      this.config = {
        blockedStates: configRow.blockedStates as string[] || ['CA'],
        magazineLimits: configRow.magazineLimits as Record<string, number> || {},
        blockAmmoStates: configRow.blockAmmoStates as string[] || [],
        assaultWeaponBlockedStates: configRow.assaultWeaponBlockedStates as string[] || [],
        rosterStates: configRow.rosterStates as Record<string, string> || {}
      };
    }

    return this.config;
  }

  /**
   * Check if state is blocked entirely
   */
  private checkBlockedState(state: string, config: ComplianceConfig): ComplianceCheckResult {
    if (config.blockedStates.includes(state)) {
      return {
        allowed: false,
        reasonCode: `STATE_BLOCKED_${state}`,
        reasonText: state === 'CA' ? 
          'We do not ship to California at this time.' : 
          `We do not ship to ${state} at this time.`
      };
    }
    return { allowed: true };
  }

  /**
   * Check magazine capacity limits
   */
  private checkMagazineCapacity(
    product: Product,
    state: string,
    config: ComplianceConfig
  ): ComplianceCheckResult {
    if (product.isMagazine && product.capacity) {
      const limit = config.magazineLimits[state];
      if (limit && product.capacity > limit) {
        return {
          allowed: false,
          reasonCode: `${state}_MAG_${limit}`,
          reasonText: `This magazine exceeds the legal capacity for ${state === 'NY' ? 'New York' : state === 'MA' ? 'Massachusetts' : 'Illinois'} (${limit} rounds).`
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Check ammunition restrictions
   */
  private checkAmmunition(
    product: Product,
    state: string,
    config: ComplianceConfig
  ): ComplianceCheckResult {
    if (config.blockAmmoStates.includes(state) && product.isAmmo) {
      return {
        allowed: false,
        reasonCode: `${state}_AMMO_BLOCK`,
        reasonText: state === 'NY' ? 
          'Ammunition sales to New York are not available at this time.' :
          `Ammunition sales to ${state} are not available at this time.`
      };
    }
    return { allowed: true };
  }

  /**
   * Check assault weapon features
   */
  private checkAssaultWeaponFeatures(
    product: Product,
    state: string,
    config: ComplianceConfig
  ): ComplianceCheckResult {
    if (config.assaultWeaponBlockedStates.includes(state) && product.hasAssaultFeatures) {
      return {
        allowed: false,
        reasonCode: `${state}_AW_BLOCK`,
        reasonText: state === 'NY' ?
          'This item configuration is not available for shipment to New York.' :
          state === 'IL' ?
          'This item configuration is not available for shipment to Illinois.' :
          `This item configuration is not available for shipment to ${state}.`
      };
    }
    return { allowed: true };
  }

  /**
   * Check handgun roster requirements
   */
  private checkHandgunRoster(
    product: Product,
    state: string,
    config: ComplianceConfig
  ): ComplianceCheckResult {
    if (state === 'MA' && product.isHandgun) {
      if (!product.handgunRosterId || product.handgunRosterId === '') {
        return {
          allowed: false,
          reasonCode: 'MA_ROSTER_FAIL',
          reasonText: 'This handgun model is not on the Massachusetts approved roster.'
        };
      }
      // In v1, we just check if the ID exists, not validate against actual roster
      // Future enhancement: check against actual MA roster database
    }
    return { allowed: true };
  }

  /**
   * Check FFL requirements (existing requirement, not a block)
   */
  private checkFFLRequirement(product: Product): string[] {
    const flags: string[] = [];
    if (product.requiresFFL) {
      flags.push('FFL_REQUIRED');
    }
    return flags;
  }

  /**
   * Perform comprehensive compliance check for a product
   */
  async checkProductCompliance(
    product: Product,
    shipState: string | null
  ): Promise<ComplianceCheckResult> {
    // If no ship state provided (e.g., at add-to-cart before address), allow but flag for re-check
    if (!shipState) {
      return {
        allowed: true,
        complianceFlags: ['PENDING_STATE_CHECK']
      };
    }

    const config = await this.loadConfig();
    const complianceFlags: string[] = [];

    // Check blocked states first
    const blockedStateCheck = this.checkBlockedState(shipState, config);
    if (!blockedStateCheck.allowed) {
      return blockedStateCheck;
    }

    // Check magazine capacity
    const magCheck = this.checkMagazineCapacity(product, shipState, config);
    if (!magCheck.allowed) {
      return magCheck;
    }

    // Check ammunition restrictions
    const ammoCheck = this.checkAmmunition(product, shipState, config);
    if (!ammoCheck.allowed) {
      return ammoCheck;
    }

    // Check assault weapon features
    const awCheck = this.checkAssaultWeaponFeatures(product, shipState, config);
    if (!awCheck.allowed) {
      return awCheck;
    }

    // Check handgun roster
    const rosterCheck = this.checkHandgunRoster(product, shipState, config);
    if (!rosterCheck.allowed) {
      return rosterCheck;
    }

    // Add FFL requirement flags (not a blocker)
    complianceFlags.push(...this.checkFFLRequirement(product));

    return {
      allowed: true,
      complianceFlags
    };
  }

  /**
   * Check compliance for multiple products (cart)
   */
  async checkCartCompliance(
    cartItems: Array<{ product: Product; quantity: number }>,
    shipState: string | null
  ): Promise<{
    allowed: boolean;
    blockedItems: Array<{
      sku: string;
      name: string;
      reasonCode: string;
      reasonText: string;
    }>;
    complianceFlags: Record<string, string[]>;
  }> {
    const blockedItems: Array<{
      sku: string;
      name: string;
      reasonCode: string;
      reasonText: string;
    }> = [];
    const complianceFlags: Record<string, string[]> = {};

    for (const item of cartItems) {
      const result = await this.checkProductCompliance(item.product, shipState);
      
      if (!result.allowed && result.reasonCode) {
        blockedItems.push({
          sku: item.product.sku || 'UNKNOWN',
          name: item.product.name,
          reasonCode: result.reasonCode,
          reasonText: result.reasonText || 'Item cannot be shipped to your state.'
        });
      } else if (result.complianceFlags && result.complianceFlags.length > 0) {
        complianceFlags[item.product.sku || item.product.id.toString()] = result.complianceFlags;
      }
    }

    return {
      allowed: blockedItems.length === 0,
      blockedItems,
      complianceFlags
    };
  }

  /**
   * Log a compliance check attempt
   */
  async logComplianceAttempt(
    attemptType: 'add_to_cart' | 'checkout',
    shipState: string,
    blockedSkus: Array<{ sku: string; reasonCode: string; reasonText: string }>,
    userId?: number,
    cartId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    if (blockedSkus.length === 0) {
      return; // Only log when items are blocked
    }

    try {
      await db.insert(complianceAttemptLogs).values({
        attemptType,
        shipState,
        blockedSkus,
        userId,
        cartId,
        ipAddress,
        userAgent,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log compliance attempt:', error);
      // Don't throw - logging failures shouldn't break the flow
    }
  }

  /**
   * Get compliance configuration (for admin UI)
   */
  async getComplianceConfig(): Promise<ComplianceConfig> {
    return await this.loadConfig();
  }

  /**
   * Update compliance configuration (admin only)
   */
  async updateComplianceConfig(
    config: Partial<ComplianceConfig>,
    adminUserId: number
  ): Promise<void> {
    const existingConfig = await db
      .select()
      .from(stateComplianceConfig)
      .where(eq(stateComplianceConfig.isActive, true))
      .limit(1);

    if (existingConfig.length === 0) {
      // Create new config
      await db.insert(stateComplianceConfig).values({
        blockedStates: config.blockedStates || ['CA'],
        magazineLimits: config.magazineLimits || { NY: 10, MA: 10, IL: 10 },
        blockAmmoStates: config.blockAmmoStates || ['NY'],
        assaultWeaponBlockedStates: config.assaultWeaponBlockedStates || ['NY', 'IL'],
        rosterStates: config.rosterStates || { MA: 'MA_HANDGUN_ROSTER' },
        isActive: true,
        lastModifiedBy: adminUserId,
        updatedAt: new Date()
      });
    } else {
      // Update existing config
      await db
        .update(stateComplianceConfig)
        .set({
          blockedStates: config.blockedStates || existingConfig[0].blockedStates,
          magazineLimits: config.magazineLimits || existingConfig[0].magazineLimits,
          blockAmmoStates: config.blockAmmoStates || existingConfig[0].blockAmmoStates,
          assaultWeaponBlockedStates: config.assaultWeaponBlockedStates || existingConfig[0].assaultWeaponBlockedStates,
          rosterStates: config.rosterStates || existingConfig[0].rosterStates,
          lastModifiedBy: adminUserId,
          updatedAt: new Date()
        })
        .where(eq(stateComplianceConfig.id, existingConfig[0].id));
    }

    // Clear cached config
    this.config = null;
  }
}

// Export singleton instance
export const stateComplianceService = new StateComplianceService();