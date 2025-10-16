// Temporary In-House (IH) SKU Allowlist
// These SKUs will be fulfilled from in-house inventory instead of drop-shipped from RSR
// This is a temporary configuration until product flags are fully populated in the database

export const IH_SKU_ALLOWLIST = new Set([
  // Example Glock SKUs that we stock in-house
  'G17G5MOS', // Glock 17 Gen 5 MOS
  'G19G5MOS', // Glock 19 Gen 5 MOS
  'G43XMOS',  // Glock 43X MOS
  
  // Example SIG SKUs that we stock in-house
  'P320-XCOMPACT', // SIG P320 X-Compact
  'P365XL',        // SIG P365 XL
  'P320-M17',      // SIG P320 M17
  
  // Example Wilson Combat SKUs that we stock in-house
  'WC-EDC-X9',     // Wilson Combat EDC X9
  'WC-SFX9',       // Wilson Combat SFX9
  
  // Example accessories/parts we stock in-house
  'MAG-G17-10',    // Glock 17 10rd Magazine
  'MAG-G19-15',    // Glock 19 15rd Magazine
  'SIGHT-TRIJICON-RMR', // Trijicon RMR sight
]);

// Function to check if a SKU should be fulfilled in-house
export function isInHouseSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  return IH_SKU_ALLOWLIST.has(sku);
}

// Function to determine fulfillment source based on product data
export function determineFulfillmentSource(product: {
  fulfillmentSource?: string | null;
  sku?: string | null;
  rsrStockNumber?: string | null;
  isFirearm?: boolean | null;
  requiresFFL?: boolean | null;
}): 'ih' | 'rsr' | 'ds_customer' {
  // If fulfillment source is explicitly set, use it (unless it's 'auto')
  if (product.fulfillmentSource === 'ih') {
    return 'ih';
  }
  if (product.fulfillmentSource === 'rsr') {
    return 'rsr';
  }
  
  // For 'auto' or unset, check the SKU allowlist
  if (product.fulfillmentSource === 'auto' || !product.fulfillmentSource) {
    // Check both SKU and RSR stock number against allowlist
    if (isInHouseSku(product.sku) || isInHouseSku(product.rsrStockNumber)) {
      return 'ih';
    }
    
    // Default behavior: firearms go to RSR, non-firearms direct to customer
    if (product.isFirearm || product.requiresFFL) {
      return 'rsr';
    }
    return 'ds_customer';
  }
  
  // Default fallback
  return product.isFirearm || product.requiresFFL ? 'rsr' : 'ds_customer';
}