/**
 * Unified FFL Detection Utility
 * Single source of truth for determining if a product requires FFL
 */

/**
 * Check if product is ammunition (does NOT require FFL)
 */
export function isAmmunition(name: string): boolean {
  const nameLower = (name || '').toLowerCase();
  
  // First check if this is a firearm with gauge/barrel specification
  // Patterns like "12/24" or "12/18.5" are gauge/barrel, not ammo
  const isFirearmSpec = /\b(?:12|16|20|28|410)\/\d+(?:\.\d+)?(?:\s|$)/i.test(name);
  if (isFirearmSpec) {
    return false;  // This is a firearm specification, not ammunition
  }
  
  // Check if this has firearm capacity indicators (4RD, 5RD, 16RD, etc)
  const hasCapacitySpec = /\b\d{1,2}RD\b/i.test(name);  // 1-2 digits + RD is typically capacity
  if (hasCapacitySpec && !nameLower.includes('box') && !nameLower.includes('case')) {
    return false;  // This is a firearm with capacity spec, not ammunition
  }
  
  // Ammunition patterns
  const ammunitionPatterns = [
    // Shot size patterns (common in shotgun shells)
    /#[0-9]+(\.5)?(?!\s*\w)/i,  // Matches #4, #5, #6, #7, #7.5, #8, #9 etc
    /\b(00+|000)\b/i,  // Matches #00, #000 buckshot
    /#00+\b/i,  // Alternative pattern for #00, #000
    
    // Grain weight patterns (common in bullets/ammunition)
    /\b\d{2,3}[\s-]?gr(?:ain)?\b/i,  // Matches 275GR, 300GR, 150 grain, etc
    
    // Ounce weight patterns (common in shotgun shells)
    /\b\d+(?:\.\d+)?[\s-]?(?:oz|ounce)\b/i,  // Matches 1OZ, 1.5OZ, 1 1/8OZ, etc
    /\b\d+\s+\d+\/\d+[\s-]?(?:oz|ounce)\b/i,  // Matches 1 1/8OZ, 1 1/4OZ patterns
    
    // Shell specifications (gauge/caliber with shot size or weight)
    /\b\d+(?:\.\d+)?["']\s*#\d+/i,  // Matches 3" #6, 2.75" #4, etc
    /\b\d+(?:\.\d+)?["']\s*\d+(?:\.\d+)?[\s-]?(?:oz|ounce)/i,  // Matches 2.75" 1OZ, etc
    /\b\d+(?:\.\d+)?["']\s*00+/i,  // Matches 2.75" 00, 3" 000, etc
    
    // Ammunition-specific keywords
    /\b(?:steel[\s-]?shot|turkey[\s-]?load|game[\s-]?load)\b/i,
    /\b(?:target[\s-]?load|field[\s-]?load|dove[\s-]?load)\b/i,
    /\b(?:waterfowl[\s-]?load|upland[\s-]?load)\b/i,
    /\b(?:buckshot|birdshot|slug[\s-]?load)\b(?!\s*gun)/i,  // Not followed by "gun"
    
    // Box/case count patterns - for actual ammunition boxes
    /\b\d{2,}\/\d{3,}\b/,  // Matches 25/250, 50/500 (ammo box counts)
    /\bbox(?:es)?\s+of\s+\d+/i,  // Matches "box of 25", "boxes of 50"
    // Match multi-digit round counts for ammo
    /\b\d{2,}[\s-]?(?:rd|rnd|round)s?\b/i,  // Matches 20rd, 50 rounds (2+ digits for ammo count)
    
    // Common ammunition terms
    /\b(?:ammo|ammunition|cartridge|shell|load|pellet)\b/i,
    /\b(?:bullet|projectile|sabot|wad)\b/i,
    
    // Ammunition brand/type patterns
    /\b(?:speed[\s-]?shok|power[\s-]?shok|super[\s-]?x)\b/i,
    /\b(?:heavy[\s-]?field|heavy[\s-]?game|high[\s-]?brass)\b/i,
    /\b(?:low[\s-]?brass|high[\s-]?velocity|magnum[\s-]?load)\b/i,
    
    // Specific ammunition product patterns
    /\bFED\s+(?:SPEED|POWER)[\s-]?SHOK/i,  // Federal ammunition products
  ];
  
  // Check if any ammunition pattern matches
  const hasAmmunitionPattern = ammunitionPatterns.some(pattern => pattern.test(name));
  
  // Also check for explicit ammunition keywords
  const ammunitionKeywords = [
    'ammunition', 'ammo', 'cartridge', 'shell', 'shells',
    'buckshot', 'birdshot', 'slug load', 'turkey load',
    'steel shot', 'lead shot', 'target load', 'field load',
    'game load', 'dove load', 'waterfowl load', 'upland load'
  ];
  
  const hasAmmunitionKeyword = ammunitionKeywords.some(keyword => 
    nameLower.includes(keyword)
  );
  
  return hasAmmunitionPattern || hasAmmunitionKeyword;
}

/**
 * Check if product is an accessory/part (does NOT require FFL)
 */
export function isAccessory(name: string): boolean {
  const nameLower = (name || '').toLowerCase();
  
  // Accessory patterns - more comprehensive to catch all accessories
  const accessoryPatterns = [
    // Cleaning and maintenance - PRIORITY CHECK for bore snakes and cleaning tools
    /\b(?:bore[\s-]?snake|boresnake)\b/i,  // Bore snake cleaning tools
    /\b(?:battle[\s-]?rope)\b/i,  // Battle rope cleaning tools
    /\b(?:cleaning|cleaner|clean)\b/i,
    /\b(?:lubricant|oil|solvent|brush|rod|patch|jag|swab)\b/i,
    /\b(?:kit|tool|maintenance)\b/i,
    
    // Parts and components
    /\b(component|parts?)\b/i,
    /\b(barrel|choke|stock|forend|tube|pad)s?\b(?!.*(shotgun|rifle|pistol|handgun))/i,
    /\b(sight|bead|mount|grip|trigger|spring|pin|screw|bolt)s?\b(?!.*(action))/i,
    /\b(magazine|mag|clip)s?\b/i,
    /\b(slide|frame|carrier|guide|assembly)\b(?!.*(shotgun|rifle|pistol))/i,
    /\b(replacement|upgrade|accessory)\b/i,
    
    // Tactical accessories
    /\b(rail|laser|light|holster|bag)\b/i,
    /\b(snap[\s-]?cap|dummy|sling|bipod|adapter)\b/i,
    /\b(plug|cap|cover|guard|extension|buffer|recoil[\s-]?pad)\b/i,
    /\b(muzzle[\s-]?brake|compensator|suppressor|silencer|moderator)\b/i,
    
    // Optics and scopes
    /\b(scope|optic|red[\s-]?dot|reflex|holographic|magnifier)\b/i,
    /\b(rangefinder|binocular|spotting[\s-]?scope|lens|filter|eyepiece)\b/i,
  ];
  
  // Check if any accessory pattern matches
  const hasAccessoryPattern = accessoryPatterns.some(pattern => pattern.test(name));
  
  if (hasAccessoryPattern) {
    return true;
  }
  
  // Additional keyword-based check for non-firearm items
  const accessoryKeywords = [
    // Cleaning items - PRIORITY
    'boresnake', 'bore snake', 'battle rope', 'cleaning', 'cleaner',
    'lubricant', 'oil', 'solvent', 'brush', 'rod', 'patch', 'jag', 'swab',
    
    // Parts and components
    'component', 'choke', 'forend', 'tube', 'pad', 
    'sight', 'bead', 'mount', 'kit', 
    'magazine', 'grip', 'trigger', 'spring', 'pin', 'screw',
    'carrier', 'guide', 'assembly', 'part', 
    'replacement', 'upgrade', 'accessory', 'rail', 'laser', 'light', 
    'holster', 'bag', 'tool',
    'snap cap', 'dummy', 'sling', 'bipod', 'adapter', 
    'plug', 'cap', 'cover', 'guard', 'extension',
    'buffer', 'recoil', 'muzzle', 'compensator', 'brake', 'suppressor',
    'silencer', 'moderator', 'thread', 'protector', 'collar', 'bushing',
    
    // Optics and accessories
    'scope', 'optic', 'red dot', 'reflex', 'holographic', 'magnifier',
    'rangefinder', 'binocular', 'spotting', 'lens', 'filter', 'eyepiece'
  ];
  
  // Check if name contains accessory keywords
  const nameWords = nameLower.split(/\s+/);
  const hasAccessoryKeyword = accessoryKeywords.some(keyword => {
    const keywordLower = keyword.toLowerCase();
    return nameWords.some(word => word === keywordLower || word.startsWith(keywordLower + 's'));
  });
  
  return hasAccessoryKeyword;
}

/**
 * Check if product is a complete firearm (requires FFL)
 */
export function isCompleteFirearm(name: string, category?: string): boolean {
  const nameLower = (name || '').toLowerCase();
  const categoryLower = (category || '').toLowerCase();
  
  // FIRST CHECK: Is this ammunition? Ammunition does NOT require FFL
  if (isAmmunition(name)) {
    return false;
  }
  
  // SECOND CHECK: Is this an accessory? Accessories do NOT require FFL
  if (isAccessory(name)) {
    return false;
  }
  
  // THIRD CHECK: Now check if it's a complete firearm
  const firearmIndicators = [
    /\b(shotgun|rifle|pistol|handgun|revolver|carbine)\b/i,
    /\b(lever[\s-]?action|bolt[\s-]?action|pump[\s-]?action|semi[\s-]?auto)\b/i,
    /\b\d+ga\b/i,  // Gauge indicators like "12GA", "20GA"
    /\b\d+[\s-]?gauge\b/i,  // Full gauge text
  ];
  
  // Check for clear firearm model patterns
  const isLikelyFirearm = firearmIndicators.some(pattern => pattern.test(name)) ||
                          // Slug gun pattern: has "slug" with gauge indicator but not ammunition
                          (/\bslug\b/i.test(name) && /\b\d+ga\b|\b\d+[\s-]?gauge\b/i.test(name) && !/\b(?:load|shell|ammo)\b/i.test(name)) ||
                          // Shotgun with action type
                          (/shotgun/i.test(name) || /singleshot/i.test(name));
  
  // Additional check for manufacturer and model patterns that indicate complete firearms
  // These patterns are common in actual firearm model names
  const firearmModelPatterns = [
    /\bWIN\s+SX\d+\b/i,  // Winchester SX models
    /\bREM\s+\d+\b/i,  // Remington model numbers (e.g., REM 870)
    /\bREMINGTON\s+\d+/i,  // Full Remington name with model
    /\bMOSSBERG\s+\d+/i,  // Mossberg model numbers
    /\bMSBRG\s+\d+/i,  // Mossberg abbreviated (e.g., MSBRG 500, MSBRG 940)
    /\bBENELLI\s+/i,  // Benelli shotguns
    /\bBERETTA\s+/i,  // Beretta shotguns
    /\bSAVAGE\s+/i,  // Savage firearms
    /\bRUGER\s+/i,  // Ruger firearms
    /\bSMITH\s*&\s*WESSON/i,  // Smith & Wesson
    /\bGLOCK\s+\d+/i,  // Glock pistols
    /\bSIG\s+SAUER/i,  // Sig Sauer
    /\bSRM\s+\d+/i,  // SRM Arms shotguns
    /\bGARAYSAR\s+/i,  // Garaysar firearms
    /\b\d+"\s+(?:BBL|BARREL)\b/i,  // Barrel length specification (e.g., "26" BBL")
    // Additional specific models that might not match other patterns
    /\b(?:870|500|590|835|88|930|940)\s+.*\d+/i,  // Common shotgun model numbers with specifications
    // Pattern for products with gauge and barrel length like "12/24" or "12/18.5"
    /\b\d{2}\/\d+(?:\.\d+)?\s+\d+RD\b/i,  // Pattern like "12/24 4RD" or "12/18.5 5RD"
  ];
  
  const hasFirearmModelPattern = firearmModelPatterns.some(pattern => pattern.test(name));
  
  return isLikelyFirearm || hasFirearmModelPattern;
}

/**
 * Determine if product requires FFL based on product data
 */
export function requiresFFL(product: {
  name?: string;
  description?: string;
  category?: string;
  department_desc?: string;
  category_desc?: string;
}): boolean {
  const department = (product.department_desc || '').toLowerCase();
  const category = (product.category || product.category_desc || '').toLowerCase();
  const name = product.name || product.description || '';
  
  // If it's ammunition, it does NOT require FFL
  if (isAmmunition(name)) {
    return false;
  }
  
  // If it's an accessory, it does NOT require FFL
  if (isAccessory(name)) {
    return false;
  }
  
  // Check if in firearm departments
  const isFirearmDepartment = department.includes('handgun') || 
                               department.includes('long gun') ||
                               department.includes('pistol') ||
                               department.includes('rifle') ||
                               department.includes('shotgun');
  
  // Check if in firearm categories
  const isFirearmCategory = category.includes('handgun') || 
                            category.includes('rifle') || 
                            category.includes('shotgun') ||
                            category.includes('pistol') ||
                            category.includes('revolver') ||
                            category.includes('semi-auto') ||
                            category.includes('bolt action') ||
                            category.includes('lever action') ||
                            category.includes('pump action');
  
  // If in a firearm department or category, check if it's actually a complete firearm
  if (isFirearmDepartment || isFirearmCategory) {
    return isCompleteFirearm(name, category);
  }
  
  // Check for specific firearm indicators in the name
  const firearmIndicators = [
    /\b(pistol|handgun|revolver|rifle|shotgun|carbine)\b/i,
    /\b(semi[\s-]?auto|bolt[\s-]?action|lever[\s-]?action|pump[\s-]?action)\b/i,
    /\b(\d+\.\d+mm|\d+mm|\d+[\s-]?gauge|\d+[\s-]?ga)\b.*\b(pistol|handgun|rifle|shotgun)\b/i
  ];
  
  const hasFirearmIndicator = firearmIndicators.some(pattern => pattern.test(name));
  
  if (hasFirearmIndicator) {
    return isCompleteFirearm(name, category);
  }
  
  return false;
}

/**
 * Generate canonical object ID for Algolia
 * Prefer RSR stock number, fallback to SKU, never use database ID
 */
export function generateCanonicalObjectId(product: {
  rsr_stock_number?: string | null;
  sku?: string | null;
  id?: number | string;
}): string {
  // Always prefer RSR stock number if available
  if (product.rsr_stock_number) {
    return product.rsr_stock_number;
  }
  
  // Fallback to SKU if available
  if (product.sku) {
    return product.sku;
  }
  
  // As a last resort, use a prefixed ID to avoid collisions
  // But this should be avoided as it causes stale records
  if (product.id) {
    return `product-${product.id}`;
  }
  
  throw new Error('Unable to generate canonical object ID: no rsr_stock_number, sku, or id available');
}

// Export for CommonJS compatibility (for use in .cjs files)
module.exports = {
  isAmmunition,
  isAccessory,
  isCompleteFirearm,
  requiresFFL,
  generateCanonicalObjectId
};