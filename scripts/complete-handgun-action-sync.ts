/**
 * Complete Handgun Action Type Sync
 * Ensures all 2,028 handgun products with action types are properly synced to Algolia
 */

import { Pool } from 'pg';

async function completeHandgunActionSync() {
  console.log('🔄 Starting complete handgun action type sync...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get all handgun products with action types
    const products = await client.query(`
      SELECT id, action_type, name, sku
      FROM products 
      WHERE department_number = '01' 
        AND action_type IS NOT NULL 
        AND action_type != ''
      ORDER BY action_type, id
    `);
    
    console.log(`📊 Found ${products.rows.length} handgun products with action types`);
    
    // Group by action type for verification
    const actionTypeGroups = {};
    products.rows.forEach(p => {
      actionTypeGroups[p.action_type] = (actionTypeGroups[p.action_type] || 0) + 1;
    });
    
    console.log('\n📋 Action types to sync:');
    Object.entries(actionTypeGroups).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} products`);
    });
    
    // Sync in smaller batches with verification
    const batchSize = 50;
    let totalSynced = 0;
    let successfulBatches = 0;
    
    console.log('\n🔄 Starting batch sync...');
    
    for (let i = 0; i < products.rows.length; i += batchSize) {
      const batch = products.rows.slice(i, i + batchSize);
      
      try {
        const response = await fetch(`https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products/batch`, {
          method: 'POST',
          headers: {
            'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY!,
            'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: batch.map(product => ({
              action: 'partialUpdateObject',
              body: {
                objectID: product.id.toString(),
                actionType: product.action_type
              }
            }))
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          totalSynced += batch.length;
          successfulBatches++;
          
          console.log(`✅ Batch ${successfulBatches}: ${batch.length} products synced (${totalSynced}/${products.rows.length})`);
          
          // Show sample of what was synced
          if (successfulBatches <= 3) {
            console.log(`   Sample: ${batch.slice(0, 2).map(p => `${p.id}:${p.action_type}`).join(', ')}`);
          }
        } else {
          const errorText = await response.text();
          console.error(`❌ Batch ${i/batchSize + 1} failed: ${errorText}`);
        }
      } catch (error) {
        console.error(`❌ Batch ${i/batchSize + 1} error:`, error);
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`\n✅ Batch sync complete: ${totalSynced}/${products.rows.length} products synced`);
    
    // Wait for indexing to complete
    console.log('\n⏱️  Waiting 30 seconds for indexing to complete...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Verify the sync worked
    console.log('\n🔍 Verifying sync results...');
    
    // Test facet query
    const facetCheck = await fetch(`https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products/query`, {
      method: 'POST',
      headers: {
        'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY!,
        'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: '',
        filters: 'departmentNumber:"01"',
        hitsPerPage: 0,
        facets: ['actionType']
      })
    });
    
    const facetResult = await facetCheck.json();
    console.log('\n📊 Updated facet counts:');
    
    if (facetResult.facets && facetResult.facets.actionType) {
      const totalFacetCount = Object.values(facetResult.facets.actionType).reduce((sum: number, count: number) => sum + count, 0);
      console.log(`Total products with action types: ${totalFacetCount}`);
      
      Object.entries(facetResult.facets.actionType).forEach(([type, count]) => {
        const expected = actionTypeGroups[type] || 0;
        const status = count === expected ? '✅' : (count > (actionTypeGroups[type] || 0) * 0.8 ? '⚠️' : '❌');
        console.log(`  ${status} ${type}: ${count} (expected: ${expected})`);
      });
      
      // Calculate success rate
      const totalExpected = Object.values(actionTypeGroups).reduce((sum: number, count: number) => sum + count, 0);
      const successRate = (totalFacetCount / totalExpected * 100).toFixed(1);
      console.log(`\n📊 Overall success rate: ${successRate}% (${totalFacetCount}/${totalExpected})`);
      
      if (successRate >= 95) {
        console.log('🎉 Sync successful! Action type filtering should now work correctly.');
      } else if (successRate >= 80) {
        console.log('⚠️  Partial success. Most action types synced but some gaps remain.');
      } else {
        console.log('❌ Sync issues detected. Further investigation needed.');
      }
      
    } else {
      console.log('❌ No action type facets found after sync');
    }
    
    // Test specific queries
    console.log('\n🎯 Testing specific action type queries:');
    
    const testQueries = ['Striker Fired', 'Single Action', 'Revolver'];
    for (const actionType of testQueries) {
      const testQuery = await fetch(`https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products/query`, {
        method: 'POST',
        headers: {
          'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY!,
          'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: '',
          filters: `departmentNumber:"01" AND actionType:"${actionType}"`,
          hitsPerPage: 0
        })
      });
      
      const testResult = await testQuery.json();
      const expected = actionTypeGroups[actionType] || 0;
      console.log(`  ${actionType}: ${testResult.nbHits} results (expected: ${expected})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the complete sync
completeHandgunActionSync().catch(console.error);