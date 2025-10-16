import { algoliasearch } from 'algoliasearch';

export interface AlgoliaTestResults {
  appId: string;
  searchApiStatus: 'success' | 'error';
  searchApiError?: string;
  adminApiStatus: 'success' | 'error';
  adminApiError?: string;
  indexStatus: 'success' | 'error';
  indexError?: string;
  indexCount?: number;
  testSearchStatus: 'success' | 'error';
  testSearchError?: string;
  testSearchResults?: number;
  overallStatus: 'healthy' | 'partial' | 'failed';
  timestamp: string;
}

export class AlgoliaConnectivityTest {
  private appId: string;
  private searchApiKey: string;
  private adminApiKey: string;
  private indexName = 'products';

  constructor() {
    this.appId = process.env.ALGOLIA_APP_ID || '';
    this.searchApiKey = process.env.ALGOLIA_API_KEY || '';
    this.adminApiKey = process.env.ALGOLIA_ADMIN_API_KEY || '';
  }

  async runFullTest(): Promise<AlgoliaTestResults> {
    const results: AlgoliaTestResults = {
      appId: this.appId,
      searchApiStatus: 'error',
      adminApiStatus: 'error',
      indexStatus: 'error',
      testSearchStatus: 'error',
      overallStatus: 'failed',
      timestamp: new Date().toISOString()
    };

    // Test 1: Search API Key
    try {
      const searchClient = algoliasearch(this.appId, this.searchApiKey);
      await searchClient.listIndices();
      results.searchApiStatus = 'success';
    } catch (error: any) {
      results.searchApiStatus = 'error';
      results.searchApiError = error.message || 'Unknown search API error';
    }

    // Test 2: Admin API Key
    try {
      const adminClient = algoliasearch(this.appId, this.adminApiKey);
      await adminClient.listIndices();
      results.adminApiStatus = 'success';
    } catch (error: any) {
      results.adminApiStatus = 'error';
      results.adminApiError = error.message || 'Unknown admin API error';
    }

    // Test 3: Index Status and Object Count
    if (results.searchApiStatus === 'success') {
      try {
        const searchClient = algoliasearch(this.appId, this.searchApiKey);
        const indexStats = await searchClient.getTaskStatus({ taskID: 0, indexName: this.indexName });
        
        // Try to get object count using browse
        const browseResult = await searchClient.browse({
          indexName: this.indexName,
          browseParams: {
            hitsPerPage: 0
          }
        });
        
        results.indexStatus = 'success';
        results.indexCount = browseResult.nbHits || 0;
      } catch (error: any) {
        // If browse fails, try a simple search to get count
        try {
          const searchClient = algoliasearch(this.appId, this.searchApiKey);
          const searchResult = await searchClient.searchSingleIndex({
            indexName: this.indexName,
            searchParams: {
              query: '',
              hitsPerPage: 1
            }
          });
          
          results.indexStatus = 'success';
          results.indexCount = searchResult.nbHits || 0;
        } catch (indexError: any) {
          results.indexStatus = 'error';
          results.indexError = indexError.message || 'Index not accessible';
        }
      }
    }

    // Test 4: Basic Search Functionality
    if (results.searchApiStatus === 'success') {
      try {
        const searchClient = algoliasearch(this.appId, this.searchApiKey);
        const searchResult = await searchClient.searchSingleIndex({
          indexName: this.indexName,
          searchParams: {
            query: 'glock',
            hitsPerPage: 5
          }
        });
        
        results.testSearchStatus = 'success';
        results.testSearchResults = searchResult.nbHits || 0;
      } catch (error: any) {
        results.testSearchStatus = 'error';
        results.testSearchError = error.message || 'Search functionality failed';
      }
    }

    // Determine Overall Status
    const successCount = [
      results.searchApiStatus,
      results.adminApiStatus,
      results.indexStatus,
      results.testSearchStatus
    ].filter(status => status === 'success').length;

    if (successCount === 4) {
      results.overallStatus = 'healthy';
    } else if (successCount >= 2) {
      results.overallStatus = 'partial';
    } else {
      results.overallStatus = 'failed';
    }

    return results;
  }

  // Quick health check for monitoring
  async quickHealthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
    try {
      const searchClient = algoliasearch(this.appId, this.searchApiKey);
      await searchClient.searchSingleIndex({
        indexName: this.indexName,
        searchParams: {
          query: '',
          hitsPerPage: 1
        }
      });
      
      return { status: 'healthy', message: 'Algolia is responding normally' };
    } catch (error: any) {
      return { 
        status: 'unhealthy', 
        message: `Algolia connectivity issue: ${error.message || 'Unknown error'}` 
      };
    }
  }
}

export const algoliaConnectivityTest = new AlgoliaConnectivityTest();