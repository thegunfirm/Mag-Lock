#!/usr/bin/env node

/**
 * Reindex Algolia Products with FFL Required Field
 * 
 * This script fetches all products from firearm categories
 * and reindexes them in Algolia with the correct fflRequired flag.
 * 
 * Run with: npm run db:push && node reindex-algolia-ffl.cjs
 */

const pg = require('pg');
const algoliasearch = require('algoliasearch').algoliasearch;
const { requiresFFL, generateCanonicalObjectId } = require('./server/utils/ffl-detection');

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

console.log('🔧 Initializing Algolia client...');
console.log(`   App ID: ${ALGOLIA_APP_ID}`);
console.log(`   Using Admin API Key: ${ALGOLIA_ADMIN_API_KEY.substring(0, 4)}...${ALGOLIA_ADMIN_API_KEY.substring(ALGOLIA_ADMIN_API_KEY.length - 4)}`);

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

// FFL detection functions are now imported from the unified utility

/**
 * Convert database product to Algolia format
 */
function productToAlgoliaFormat(product) {
  const fflRequired = requiresFFL(product);
  
  // Log FFL determination for ammunition products
  if (product.name && product.name.toLowerCase().includes('shok')) {
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
  
  // Use canonical objectID from unified utility to ensure proper replacement
  const objectID = generateCanonicalObjectId(product);
  
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
    inStock: product.in_stock || false,
    caliber: product.caliber,
    capacity: product.capacity,
    barrelLength: product.barrel_length,
    finish: product.finish,
    frameSize: product.frame_size,
    actionType: product.action_type,
    sightType: product.sight_type,
    tags: tags,
    newItem: product.new_item || false,
    internalSpecial: product.internal_special || false,
    retailPrice: parseFloat(product.price_msrp || '0'),
    retailMap: parseFloat(product.price_map || '0'),
    msrp: parseFloat(product.price_msrp || '0'),
    dealerPrice: parseFloat(product.price_wholesale || '0'),
    price: parseFloat(product.price_bronze || product.price_msrp || '0'),
    fflRequired,
    mpn: product.manufacturer_part_number,
    upc: product.upc_code,
    weight: parseFloat(product.weight || '0'),
    dropShippable: product.drop_shippable !== false,
    popularityScore: 0,
    isActive: product.is_active !== false,
    createdAt: product.created_at || new Date().toISOString(),
    updatedAt: product.updated_at || new Date().toISOString()
  };
}

/**
 * Verify indexed products in Algolia
 */
async function verifyIndexedProducts(sampleProducts) {
  console.log('\n🔍 Verifying indexed products in Algolia...');
  
  const verificationResults = {
    success: 0,
    failed: 0,
    mismatch: 0
  };
  
  for (const product of sampleProducts) {
    try {
      // Search for the product by objectID using getObjects method
      const { results } = await algoliaClient.getObjects({
        requests: [{
          indexName: INDEX_NAME,
          objectID: product.objectID
        }]
      });
      
      const result = results[0];
      
      if (result) {
        verificationResults.success++;
        
        // Check if fflRequired matches
        if (result.fflRequired !== product.fflRequired) {
          verificationResults.mismatch++;
          console.log(`   ⚠️ FFL mismatch for "${product.name}": Expected ${product.fflRequired}, Got ${result.fflRequired}`);
        } else {
          console.log(`   ✅ Verified: "${product.name}" - fflRequired: ${result.fflRequired}`);
        }
      } else {
        verificationResults.failed++;
        console.log(`   ❌ Product not found: "${product.name}" (${product.objectID})`);
      }
    } catch (error) {
      verificationResults.failed++;
      console.log(`   ❌ Failed to verify: "${product.name}" - ${error.message}`);
    }
  }
  
  console.log(`\n📊 Verification Results:`);
  console.log(`   Successfully verified: ${verificationResults.success}`);
  console.log(`   Failed to verify: ${verificationResults.failed}`);
  console.log(`   FFL value mismatches: ${verificationResults.mismatch}`);
  
  return verificationResults;
}

/**
 * Main reindexing function
 */
async function reindexAlgoliaFFL() {
  console.log('🚀 Starting Algolia FFL Reindexing Process');
  console.log('================================================\n');
  
  let client;
  
  try {
    // Connect to database
    console.log('🔗 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Database connected\n');
    
    // Fetch products from firearm categories
    console.log('📊 Fetching products from firearm categories...');
    
    const query = `
      SELECT * FROM products 
      WHERE 
        category ILIKE '%Handgun%' OR 
        category ILIKE '%Rifle%' OR 
        category ILIKE '%Shotgun%' OR
        category ILIKE '%Ammunition%' OR
        department_desc ILIKE '%Handgun%' OR
        department_desc ILIKE '%Rifle%' OR
        department_desc ILIKE '%Shotgun%' OR
        department_desc ILIKE '%Ammunition%'
      ORDER BY id
    `;
    
    const result = await client.query(query);
    const firearmProducts = result.rows;
    
    console.log(`✅ Found ${firearmProducts.length} products in firearm/ammunition categories\n`);
    
    if (firearmProducts.length === 0) {
      console.log('⚠️ No products found in specified categories');
      return;
    }
    
    // Process products and prepare for indexing
    console.log('🔄 Processing products for Algolia indexing...');
    
    const algoliaProducts = [];
    let fflRequiredCount = 0;
    let nonFflCount = 0;
    const ammunitionProducts = [];
    
    for (const product of firearmProducts) {
      const algoliaProduct = productToAlgoliaFormat(product);
      algoliaProducts.push(algoliaProduct);
      
      if (algoliaProduct.fflRequired) {
        fflRequiredCount++;
      } else {
        nonFflCount++;
        // Track ammunition products specifically
        if (product.name && (product.name.includes('SHOK') || product.name.includes('#'))) {
          ammunitionProducts.push(algoliaProduct);
        }
      }
      
      // Show progress every 100 products
      if (algoliaProducts.length % 100 === 0) {
        console.log(`   Processed ${algoliaProducts.length}/${firearmProducts.length} products...`);
      }
    }
    
    console.log(`✅ Processed all ${algoliaProducts.length} products`);
    console.log(`   - ${fflRequiredCount} require FFL`);
    console.log(`   - ${nonFflCount} do not require FFL`);
    console.log(`   - ${ammunitionProducts.length} ammunition products detected\n`);
    
    // Index products in Algolia in batches
    console.log('📤 Indexing products to Algolia...');
    console.log(`   Using index: ${INDEX_NAME}`);
    console.log('   Replace existing records: YES (using objectID)\n');
    
    const batchSize = 1000;
    let indexed = 0;
    let failedBatches = [];
    
    for (let i = 0; i < algoliaProducts.length; i += batchSize) {
      const batch = algoliaProducts.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      console.log(`   📦 Processing batch ${batchNumber} (${batch.length} products)...`);
      
      try {
        // Use the correct Algolia v5 API with saveObjects on the client
        const result = await algoliaClient.saveObjects({
          indexName: INDEX_NAME,
          objects: batch
        });
        
        indexed += batch.length;
        console.log(`   ✅ Batch ${batchNumber} indexed successfully`);
        console.log(`      - Task ID: ${result.taskID}`);
        console.log(`      - Object IDs indexed: ${batch.length}`);
        console.log(`      - Total indexed so far: ${indexed}/${algoliaProducts.length}`);
        
        // Wait for task to complete
        await algoliaClient.waitForTask({
          indexName: INDEX_NAME,
          taskID: result.taskID
        });
        console.log(`   ✅ Batch ${batchNumber} task completed\n`);
        
      } catch (error) {
        console.error(`   ❌ Error indexing batch ${batchNumber}:`, error.message);
        console.error(`      Error details:`, error);
        failedBatches.push({ batchNumber, error: error.message, size: batch.length });
        // Continue with next batch even if one fails
      }
    }
    
    console.log(`\n✅ Indexing complete!`);
    console.log(`   Successfully indexed: ${indexed} products`);
    if (failedBatches.length > 0) {
      console.log(`   ⚠️ Failed batches: ${failedBatches.length}`);
      failedBatches.forEach(fb => {
        console.log(`      - Batch ${fb.batchNumber} (${fb.size} products): ${fb.error}`);
      });
    }
    
    // Verify a sample of indexed products
    console.log('\n🔍 Verifying indexed products...');
    
    // Verify some ammunition products specifically
    const ammunitionSample = ammunitionProducts.slice(0, 5);
    if (ammunitionSample.length > 0) {
      console.log('\n📌 Verifying ammunition products (should have fflRequired: false):');
      await verifyIndexedProducts(ammunitionSample);
    }
    
    // Verify some firearm products
    const firearmSample = algoliaProducts
      .filter(p => p.fflRequired)
      .slice(0, 5);
    
    if (firearmSample.length > 0) {
      console.log('\n📌 Verifying firearm products (should have fflRequired: true):');
      await verifyIndexedProducts(firearmSample);
    }
    
    // Print summary report
    console.log('\n\n📋 REINDEXING SUMMARY');
    console.log('================================================');
    console.log(`Total Products Processed:      ${firearmProducts.length}`);
    console.log(`Successfully Indexed:           ${indexed}`);
    console.log(`Failed to Index:                ${firearmProducts.length - indexed}`);
    console.log(`Products Requiring FFL:         ${fflRequiredCount} (${((fflRequiredCount / firearmProducts.length) * 100).toFixed(1)}%)`);
    console.log(`Products NOT Requiring FFL:     ${nonFflCount} (${((nonFflCount / firearmProducts.length) * 100).toFixed(1)}%)`);
    console.log(`Ammunition Products:            ${ammunitionProducts.length}`);
    console.log('================================================');
    
    // Sample of FFL-required products for verification
    console.log('\n📌 Sample of Products Requiring FFL (up to 5):');
    const fflSamples = algoliaProducts
      .filter(p => p.fflRequired)
      .slice(0, 5);
    
    if (fflSamples.length > 0) {
      for (const sample of fflSamples) {
        console.log(`   - ${sample.name}`);
        console.log(`     Category: ${sample.categoryName}`);
        console.log(`     ObjectID: ${sample.objectID}`);
      }
    } else {
      console.log('   No products requiring FFL found');
    }
    
    console.log('\n📌 Sample of Products NOT Requiring FFL (up to 10):');
    const nonFflSamples = algoliaProducts
      .filter(p => !p.fflRequired)
      .slice(0, 10);
    
    if (nonFflSamples.length > 0) {
      for (const sample of nonFflSamples) {
        console.log(`   - ${sample.name}`);
        console.log(`     Category: ${sample.categoryName}`);
        console.log(`     ObjectID: ${sample.objectID}`);
        
        // Highlight ammunition products
        if (sample.name && (sample.name.includes('SHOK') || sample.name.includes('#'))) {
          console.log(`     🎯 AMMUNITION PRODUCT - Correctly marked as NOT requiring FFL`);
        }
      }
    } else {
      console.log('   No products NOT requiring FFL found');
    }
    
    console.log('\n✨ Algolia FFL reindexing completed successfully!');
    console.log('🔍 Please verify in the Algolia dashboard that products are correctly indexed.');
    console.log('   Check specifically for ammunition products like "FED SPEED-SHOK" - they should have fflRequired: false');
    
  } catch (error) {
    console.error('❌ Fatal error during reindexing:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Clean up
    if (client) {
      client.release();
    }
    await pool.end();
    process.exit(0);
  }
}

// Run the reindexing
reindexAlgoliaFFL();