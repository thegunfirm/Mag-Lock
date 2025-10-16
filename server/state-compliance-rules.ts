/**
 * Centralized State Compliance Rules Module
 * 
 * This module serves as the single source of truth for all state-specific
 * firearms and ammunition regulations. It enforces compliance at both
 * cart and checkout levels.
 */

import type { CartItem } from './firearms-compliance-service';
import { db } from './db';
import { products } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * State compliance result interface
 */
export interface StateComplianceResult {
  isAllowed: boolean;
  state: string;
  blockedItems: Array<{
    productId: number;
    productName: string;
    reason: string;
  }>;
  warnings: string[];
  message?: string;
}

/**
 * Product compliance details interface
 */
export interface ProductComplianceInfo {
  productId: number;
  productName: string;
  sku: string;
  isFirearm: boolean;
  isAmmunition: boolean;
  magazineCapacity?: number;
  productType?: string;
}

/**
 * State rules configuration
 */
interface StateRules {
  [state: string]: {
    blockedCategories: string[];
    magazineCapacityLimit?: number;
    customRules?: (item: ProductComplianceInfo) => { allowed: boolean; reason?: string };
    description: string;
  };
}

/**
 * Comprehensive state-specific rules
 * Easy to extend with new states and regulations
 */
const STATE_RULES: StateRules = {
  CA: {
    blockedCategories: ['firearm', 'ammunition', 'magazine', 'receiver'],
    description: 'California - All firearms and ammunition sales blocked',
    customRules: (item) => {
      // Block all firearms and ammunition for California
      if (item.isFirearm || item.isAmmunition) {
        return { 
          allowed: false, 
          reason: 'California law prohibits direct shipment of firearms and ammunition' 
        };
      }
      
      // Also block specific product types
      const blockedTypes = ['handgun', 'rifle', 'shotgun', 'ammo', 'ammunition', 'magazine'];
      if (item.productType && blockedTypes.some(type => 
        item.productType!.toLowerCase().includes(type)
      )) {
        return { 
          allowed: false, 
          reason: 'This product type cannot be shipped to California' 
        };
      }
      
      return { allowed: true };
    }
  },
  
  MA: {
    blockedCategories: [],
    magazineCapacityLimit: 10,
    description: 'Massachusetts - 10 round magazine capacity limit',
    customRules: (item) => {
      // Check magazine capacity for Massachusetts
      if (item.magazineCapacity && item.magazineCapacity > 10) {
        return { 
          allowed: false, 
          reason: `Massachusetts law prohibits magazines over 10 rounds (this item has ${item.magazineCapacity} round capacity)` 
        };
      }
      
      // Block pre-ban assault weapons
      const bannedKeywords = ['assault', 'ar-15', 'ak-47'];
      if (item.productName && bannedKeywords.some(keyword => 
        item.productName.toLowerCase().includes(keyword)
      )) {
        return { 
          allowed: false, 
          reason: 'This firearm model is restricted in Massachusetts' 
        };
      }
      
      return { allowed: true };
    }
  },
  
  NY: {
    blockedCategories: [],
    magazineCapacityLimit: 10,
    description: 'New York - 10 round magazine capacity limit, SAFE Act restrictions',
    customRules: (item) => {
      // NY SAFE Act magazine restrictions
      if (item.magazineCapacity && item.magazineCapacity > 10) {
        return { 
          allowed: false, 
          reason: `New York SAFE Act prohibits magazines over 10 rounds` 
        };
      }
      
      return { allowed: true };
    }
  },
  
  NJ: {
    blockedCategories: [],
    magazineCapacityLimit: 10,
    description: 'New Jersey - 10 round magazine capacity limit',
    customRules: (item) => {
      if (item.magazineCapacity && item.magazineCapacity > 10) {
        return { 
          allowed: false, 
          reason: `New Jersey law limits magazine capacity to 10 rounds` 
        };
      }
      
      return { allowed: true };
    }
  },
  
  CT: {
    blockedCategories: [],
    magazineCapacityLimit: 10,
    description: 'Connecticut - 10 round magazine capacity limit',
    customRules: (item) => {
      if (item.magazineCapacity && item.magazineCapacity > 10) {
        return { 
          allowed: false, 
          reason: `Connecticut law limits magazine capacity to 10 rounds` 
        };
      }
      
      return { allowed: true };
    }
  }
};

/**
 * Get product compliance information from database
 */
async function getProductComplianceInfo(productId: number): Promise<ProductComplianceInfo | null> {
  try {
    const [product] = await db.select().from(products)
      .where(eq(products.id, productId))
      .limit(1);
    
    if (!product) {
      return null;
    }
    
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      isFirearm: product.isFirearm || false,
      isAmmunition: product.isAmmo || product.category?.toLowerCase().includes('ammo') || false,
      magazineCapacity: product.capacity || undefined,
      productType: product.category || undefined
    };
  } catch (error) {
    console.error('Error fetching product compliance info:', error);
    return null;
  }
}

/**
 * Check if a single product can be shipped to a specific state
 */
export async function checkProductStateCompliance(
  productId: number,
  state: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Normalize state code
  const stateCode = state.toUpperCase().trim();
  
  // If no rules for this state, allow by default
  if (!STATE_RULES[stateCode]) {
    return { allowed: true };
  }
  
  const rules = STATE_RULES[stateCode];
  const productInfo = await getProductComplianceInfo(productId);
  
  if (!productInfo) {
    console.warn(`Product ${productId} not found for compliance check`);
    return { allowed: true }; // Allow if product not found (graceful degradation)
  }
  
  // Apply custom rules if defined
  if (rules.customRules) {
    const result = rules.customRules(productInfo);
    if (!result.allowed) {
      return result;
    }
  }
  
  // Check blocked categories
  if (rules.blockedCategories.length > 0) {
    const productCategory = productInfo.productType?.toLowerCase() || '';
    for (const blockedCategory of rules.blockedCategories) {
      if (productCategory.includes(blockedCategory) || 
          (blockedCategory === 'firearm' && productInfo.isFirearm) ||
          (blockedCategory === 'ammunition' && productInfo.isAmmunition)) {
        return { 
          allowed: false, 
          reason: `${rules.description} - This category is restricted` 
        };
      }
    }
  }
  
  // Check magazine capacity limits
  if (rules.magazineCapacityLimit && productInfo.magazineCapacity) {
    if (productInfo.magazineCapacity > rules.magazineCapacityLimit) {
      return { 
        allowed: false, 
        reason: `State law limits magazine capacity to ${rules.magazineCapacityLimit} rounds` 
      };
    }
  }
  
  return { allowed: true };
}

/**
 * Check cart items for state compliance
 */
export async function checkCartStateCompliance(
  cartItems: CartItem[],
  shippingState: string
): Promise<StateComplianceResult> {
  // Normalize state code
  const stateCode = shippingState.toUpperCase().trim();
  
  const result: StateComplianceResult = {
    isAllowed: true,
    state: stateCode,
    blockedItems: [],
    warnings: []
  };
  
  // If no rules for this state, allow everything
  if (!STATE_RULES[stateCode]) {
    return result;
  }
  
  const rules = STATE_RULES[stateCode];
  
  // Add state description as a warning for restricted states
  if (stateCode === 'CA' || stateCode === 'MA' || stateCode === 'NY' || stateCode === 'NJ' || stateCode === 'CT') {
    result.warnings.push(`⚠️ ${rules.description}`);
  }
  
  // Check each cart item
  for (const item of cartItems) {
    const complianceCheck = await checkProductStateCompliance(item.productId, stateCode);
    
    if (!complianceCheck.allowed) {
      result.isAllowed = false;
      result.blockedItems.push({
        productId: item.productId,
        productName: item.productName,
        reason: complianceCheck.reason || 'Restricted in this state'
      });
    }
  }
  
  // Generate summary message
  if (!result.isAllowed) {
    const itemCount = result.blockedItems.length;
    result.message = `Cannot ship ${itemCount} item${itemCount > 1 ? 's' : ''} to ${stateCode}. ${rules.description}`;
  }
  
  return result;
}

/**
 * Get state compliance rules description
 */
export function getStateRulesDescription(state: string): string | null {
  const stateCode = state.toUpperCase().trim();
  const rules = STATE_RULES[stateCode];
  return rules ? rules.description : null;
}

/**
 * Get all states with restrictions
 */
export function getRestrictedStates(): Array<{ state: string; description: string }> {
  return Object.entries(STATE_RULES).map(([state, rules]) => ({
    state,
    description: rules.description
  }));
}

/**
 * Log compliance block for audit trail
 */
export async function logComplianceBlock(
  userId: number | string,
  state: string,
  blockedItems: Array<{ productId: number; productName: string; reason: string }>,
  context: 'cart' | 'checkout'
): Promise<void> {
  console.log(`🚫 STATE COMPLIANCE BLOCK - ${context.toUpperCase()}`);
  console.log(`   User: ${userId}`);
  console.log(`   State: ${state}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Blocked Items:`);
  
  blockedItems.forEach(item => {
    console.log(`   - Product #${item.productId}: ${item.productName}`);
    console.log(`     Reason: ${item.reason}`);
  });
  
  // TODO: In production, this should also write to a dedicated compliance audit table
  // for regulatory compliance and reporting purposes
}

/**
 * Check if state has any restrictions
 */
export function stateHasRestrictions(state: string): boolean {
  const stateCode = state.toUpperCase().trim();
  return STATE_RULES.hasOwnProperty(stateCode);
}

/**
 * Get magazine capacity limit for a state
 */
export function getStateMagazineLimit(state: string): number | null {
  const stateCode = state.toUpperCase().trim();
  const rules = STATE_RULES[stateCode];
  return rules?.magazineCapacityLimit || null;
}