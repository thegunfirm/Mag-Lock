#!/usr/bin/env node

/**
 * Focused Shotgun Products Reindex Script for Algolia
 * 
 * This script:
 * 1. Deletes all existing Shotgun category products from Algolia
 * 2. Fetches all Shotgun products from database
 * 3. Uses unified FFL detection to properly flag products
 * 4. Uses canonical objectIDs (rsr_stock_number || sku)
 * 5. Saves all products to Algolia with autoGenerateObjectIDIfNotExist=false
 * 6. Verifies the results
 * 
 * Run with: npm run db:push && node reindex-shotguns.cjs
 */

const pg = require('pg');
const algoliasearch = require('algoliasearch').algoliasearch;

// ============================================================================
// FFL Detection Logic (embedded directly to avoid TypeScript import issues)
// ============================================================================

/**
 * Check if product is ammunition (does NOT require FFL)
 */
function isAmmunition(name) {
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
function isAccessory(name) {
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
function isCompleteFirearm(name, category) {
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
function requiresFFL(product) {
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
function generateCanonicalObjectId(product) {
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

// ============================================================================
// End of FFL Detection Logic
// ============================================================================

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Initialize Algolia client
const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_API_KEY = process.env.ALGOLIA_ADMIN_API_KEY;

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY) {
  console.error('❌ Error: Missing Algolia credentials. Please set ALGOLIA_APP_ID and ALGOLIA_ADMIN_API_KEY environment variables.');
  process.exit(1);
}

console.log('🔧 Initializing Shotgun Reindex Script...');
console.log('   App ID:', ALGOLIA_APP_ID);
console.log('   Using Admin API Key:', ALGOLIA_ADMIN_API_KEY.substring(0, 4) + '...' + ALGOLIA_ADMIN_API_KEY.substring(ALGOLIA_ADMIN_API_KEY.length - 4));

const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
const INDEX_NAME = 'products';

console.log('✅ Algolia client initialized');
console.log(`   Target index: ${INDEX_NAME}\n`);

// Create database pool
const isNeonDatabase = DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('neon.database.url');
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: isNeonDatabase ? { rejectUnauthorized: false } : false
});

/**
 * Convert database product to Algolia format
 */
function productToAlgoliaFormat(product) {
  // Use unified FFL detection
  const fflRequired = requiresFFL(product);
  
  // Log FFL determination for specific test cases
  const testCases = [
    'BCT BATTLE ROPE',
    'BORESNAKE',
    'WIN SX4',
    'REM 870',
    'FED SPEED-SHOK'
  ];
  
  if (testCases.some(test => product.name && product.name.toUpperCase().includes(test))) {
    console.log(`   🔍 FFL Check: "${product.name}" -> fflRequired: ${fflRequired}`);
  }
  
  // Parse JSON fields safely
  let tags = [];
  try {
    tags = product.tags ? JSON.parse(product.tags) : [];
  } catch (e) {
    tags = [];
  }
  
  // Build tier pricing object
  const tierPricing = {
    bronze: parseFloat(product.price_bronze || product.price_msrp || '0'),
    gold: parseFloat(product.price_gold || product.price_map || '0'),
    platinum: parseFloat(product.price_platinum || product.price_wholesale || '0')
  };
  
  // Use canonical objectID from utility
  const objectID = generateCanonicalObjectId(product);
  
  // Parse images JSON safely
  let images = [];
  try {
    images = product.images ? JSON.parse(product.images) : [];
  } catch (e) {
    images = [];
  }
  
  return {
    objectID,
    name: product.name,
    description: product.description || '',
    stockNumber: product.rsr_stock_number || product.sku,
    rsrStockNumber: product.rsr_stock_number,
    manufacturer: product.manufacturer || '',
    categoryName: product.category || '',
    tierPricing,
    inventoryQuantity: product.stock_quantity || 0,
    inStock: product.stock_quantity > 0,
    dropShippable: product.drop_shippable === true || product.drop_shippable === 'Y',
    newItem: product.new_item === true || product.new_item === 'Y',
    fflRequired,
    popularityScore: 0,
    isActive: product.is_active !== false,
    tags,
    images: images.length > 0 ? images.map((img, idx) => ({ image: img, id: String(idx + 1) })) : [],
    createdAt: product.created_at || new Date().toISOString(),
    
    // Additional fields for search
    searchableText: `${product.name} ${product.manufacturer} ${product.category}`.toLowerCase(),
    
    // Department info
    departmentDesc: product.department_desc || '',
    
    // Additional product attributes
    caliber: product.caliber,
    actionType: product.action_type,
    barrelLength: product.barrel_length,
    capacity: product.capacity,
    finish: product.finish,
    frameSize: product.frame_size,
    sightType: product.sight_type,
    
    // Price fields for filtering
    msrp: parseFloat(product.price_msrp || '0'),
    retailPrice: parseFloat(product.price_msrp || '0'),
    dealerPrice: parseFloat(product.price_wholesale || '0')
  };
}

async function main() {
  let client;
  
  try {
    // Step 1: Delete all existing Shotgun category products from Algolia
    console.log('📋 Step 1: Deleting existing Shotgun products from Algolia...');
    
    // Search for all products in the Shotgun category
    const searchResults = await algoliaClient.searchSingleIndex({
      indexName: INDEX_NAME,
      searchParams: {
        query: '',
        filters: 'categoryName:Shotguns OR categoryName:Shotgun',
        hitsPerPage: 1000,
        attributesToRetrieve: ['objectID']
      }
    });
    
    console.log(`   Found ${searchResults.hits.length} existing Shotgun products in Algolia`);
    
    if (searchResults.hits.length > 0) {
      const objectIdsToDelete = searchResults.hits.map(hit => hit.objectID);
      console.log('   Deleting existing records...');
      await algoliaClient.deleteObjects({
        indexName: INDEX_NAME,
        objectIDs: objectIdsToDelete
      });
      console.log(`   ✅ Deleted ${objectIdsToDelete.length} stale records`);
    }
    
    // Step 2: Fetch all Shotgun products from database
    console.log('\n📋 Step 2: Fetching all Shotgun products from database...');
    
    client = await pool.connect();
    
    const query = `
      SELECT 
        id,
        name,
        sku,
        description,
        category,
        manufacturer,
        stock_quantity,
        price_msrp,
        price_map,
        price_wholesale,
        price_bronze,
        price_gold,
        price_platinum,
        images,
        is_active,
        created_at,
        tags,
        rsr_stock_number,
        department_desc,
        drop_shippable,
        new_item,
        caliber,
        action_type,
        barrel_length,
        capacity,
        finish,
        frame_size,
        sight_type,
        requires_ffl,
        is_firearm
      FROM products
      WHERE LOWER(category) = 'shotguns'
         OR LOWER(category) = 'shotgun'
      ORDER BY created_at DESC;
    `;
    
    const result = await client.query(query);
    
    console.log(`   Found ${result.rows.length} Shotgun products in database`);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No Shotgun products found in database');
      return;
    }
    
    // Step 3: Analyze products by FFL requirement
    console.log('\n📋 Step 3: Analyzing products for FFL requirements...');
    
    const firearms = [];
    const accessories = [];
    const ammunition = [];
    
    result.rows.forEach(product => {
      const fflRequired = requiresFFL(product);
      
      if (fflRequired) {
        firearms.push(product);
      } else if (product.name && product.name.toLowerCase().match(/ammo|shell|load|#\d+/)) {
        ammunition.push(product);
      } else {
        accessories.push(product);
      }
    });
    
    console.log(`   Product breakdown:`);
    console.log(`   - Complete Firearms (FFL Required): ${firearms.length}`);
    console.log(`   - Accessories/Parts (No FFL): ${accessories.length}`);
    console.log(`   - Ammunition (No FFL): ${ammunition.length}`);
    
    // Show sample products from each category
    if (firearms.length > 0) {
      console.log('\n   Sample Firearms:');
      firearms.slice(0, 3).forEach(p => {
        console.log(`     ✓ ${p.name} (${p.rsr_stock_number || p.sku})`);
      });
    }
    
    if (accessories.length > 0) {
      console.log('\n   Sample Accessories:');
      accessories.slice(0, 3).forEach(p => {
        console.log(`     ✓ ${p.name} (${p.rsr_stock_number || p.sku})`);
      });
    }
    
    if (ammunition.length > 0) {
      console.log('\n   Sample Ammunition:');
      ammunition.slice(0, 3).forEach(p => {
        console.log(`     ✓ ${p.name} (${p.rsr_stock_number || p.sku})`);
      });
    }
    
    // Step 4: Convert to Algolia format and save
    console.log('\n📋 Step 4: Converting products to Algolia format...');
    
    const algoliaProducts = result.rows.map(productToAlgoliaFormat);
    
    // Step 5: Save to Algolia
    console.log('\n📋 Step 5: Saving products to Algolia...');
    
    const batchSize = 100;
    let savedCount = 0;
    
    for (let i = 0; i < algoliaProducts.length; i += batchSize) {
      const batch = algoliaProducts.slice(i, i + batchSize);
      
      // Save with autoGenerateObjectIDIfNotExist=false to use our canonical IDs
      await algoliaClient.saveObjects({
        indexName: INDEX_NAME,
        objects: batch
      });
      savedCount += batch.length;
      
      console.log(`   Progress: ${savedCount}/${algoliaProducts.length} products saved`);
    }
    
    console.log(`   ✅ Successfully saved ${savedCount} products to Algolia`);
    
    // Step 6: Verify results
    console.log('\n📋 Step 6: Verifying results...');
    
    // Test specific products
    const testCases = [
      { name: 'BCT BATTLE ROPE 2.0 12GA', expectedFFL: false },
      { name: 'BORESNAKE 12GA W/ DEN', expectedFFL: false },
      { name: 'WIN SX4 12GA 26" 3.5" BLK SYN', expectedFFL: true },
      { name: 'REM 870 HHD 12GA 18.5" 6RD WD', expectedFFL: true },
      { name: 'FED SPEED-SHOK STEEL 410 3" #6', expectedFFL: false }
    ];
    
    console.log('\n   Testing specific products:');
    for (const test of testCases) {
      // Find the product in our results
      const product = result.rows.find(p => 
        p.name && p.name.toUpperCase().includes(test.name.split(' ')[0])
      );
      
      if (product) {
        const fflRequired = requiresFFL(product);
        const status = fflRequired === test.expectedFFL ? '✅' : '❌';
        console.log(`   ${status} "${product.name.substring(0, 50)}..." - fflRequired: ${fflRequired} (expected: ${test.expectedFFL})`);
      } else {
        console.log(`   ⚠️  Could not find product matching "${test.name}"`);
      }
    }
    
    // Query Algolia to verify
    console.log('\n   Verifying in Algolia index:');
    const verifySearch = await algoliaClient.searchSingleIndex({
      indexName: INDEX_NAME,
      searchParams: {
        query: '',
        filters: 'categoryName:Shotguns AND fflRequired:true',
        hitsPerPage: 5,
        attributesToRetrieve: ['name', 'fflRequired', 'objectID']
      }
    });
    
    console.log(`   Found ${verifySearch.nbHits} firearms in Shotgun category with fflRequired:true`);
    if (verifySearch.hits.length > 0) {
      console.log('   Sample firearms in Algolia:');
      verifySearch.hits.forEach(hit => {
        console.log(`     ✓ ${hit.name} (ID: ${hit.objectID})`);
      });
    }
    
    const accessorySearch = await algoliaClient.searchSingleIndex({
      indexName: INDEX_NAME,
      searchParams: {
        query: '',
        filters: 'categoryName:Shotguns AND fflRequired:false',
        hitsPerPage: 5,
        attributesToRetrieve: ['name', 'fflRequired', 'objectID']
      }
    });
    
    console.log(`\n   Found ${accessorySearch.nbHits} accessories/ammo in Shotgun category with fflRequired:false`);
    if (accessorySearch.hits.length > 0) {
      console.log('   Sample accessories/ammo in Algolia:');
      accessorySearch.hits.forEach(hit => {
        console.log(`     ✓ ${hit.name} (ID: ${hit.objectID})`);
      });
    }
    
    console.log('\n✅ Shotgun products reindex completed successfully!');
    
    // Summary
    console.log('\n📊 Final Summary:');
    console.log(`   Total products indexed: ${algoliaProducts.length}`);
    console.log(`   Complete firearms (FFL): ${firearms.length}`);
    console.log(`   Accessories/Parts (No FFL): ${accessories.length}`);
    console.log(`   Ammunition (No FFL): ${ammunition.length}`);
    
  } catch (error) {
    console.error('\n❌ Error during reindex:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});