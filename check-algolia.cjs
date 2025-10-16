require('dotenv').config();
const { algoliasearch } = require('algoliasearch');

const client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_ADMIN_API_KEY);

async function check() {
  try {
    // Check total Shotgun products  
    const allShotguns = await client.searchSingleIndex({
      indexName: 'products',
      searchParams: {
        query: '',
        filters: 'categoryName:"Shotguns"',
        hitsPerPage: 5,
        attributesToRetrieve: ['name', 'categoryName', 'fflRequired', 'objectID']
      }
    });
    
    console.log('Total Shotgun products in Algolia:', allShotguns.nbHits);
    console.log('\nSample products:');
    allShotguns.hits.forEach(hit => {
      console.log(' -', hit.name?.substring(0, 50), '| fflRequired:', hit.fflRequired);
    });
    
    // Check for FFL-required shotguns
    const fflShotguns = await client.searchSingleIndex({
      indexName: 'products',
      searchParams: {
        query: '',
        filters: 'categoryName:"Shotguns" AND fflRequired:true',
        hitsPerPage: 5
      }
    });
    
    console.log('\nShotguns with fflRequired=true:', fflShotguns.nbHits);
    
    // Check for non-FFL shotguns
    const nonFflShotguns = await client.searchSingleIndex({
      indexName: 'products',
      searchParams: {
        query: '',
        filters: 'categoryName:"Shotguns" AND fflRequired:false',
        hitsPerPage: 5
      }
    });
    
    console.log('Shotguns with fflRequired=false:', nonFflShotguns.nbHits);
    
    // Search for specific products
    const winSearch = await client.searchSingleIndex({
      indexName: 'products',
      searchParams: {
        query: 'WIN SX4',
        hitsPerPage: 3
      }
    });
    console.log('\n"WIN SX4" search results:', winSearch.nbHits);
    winSearch.hits.forEach(hit => {
      console.log(' -', hit.name?.substring(0, 50), '| fflRequired:', hit.fflRequired);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();