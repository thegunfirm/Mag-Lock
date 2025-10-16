/**
 * FFL Caching Service with fallback mechanism
 * Provides resilient FFL data access with memory cache and database persistence
 */

import { db } from '../db';
import { ffls, type FFL } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

interface CachedFFL {
  data: FFL;
  cachedAt: number;
  lastUpdated: number;
  source: 'api' | 'cache' | 'database';
}

interface FFLCacheEntry {
  ffl: CachedFFL;
  accessCount: number;
  lastAccessed: number;
}

interface FFLCacheStats {
  hits: number;
  misses: number;
  apiCalls: number;
  dbFallbacks: number;
  staleServed: number;
}

export class FFLCacheService {
  private memoryCache: Map<number, FFLCacheEntry> = new Map();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly MAX_CACHE_SIZE = 1000; // Maximum FFLs to keep in memory
  
  private stats: FFLCacheStats = {
    hits: 0,
    misses: 0,
    apiCalls: 0,
    dbFallbacks: 0,
    staleServed: 0
  };

  constructor() {
    // Start periodic cleanup
    this.startCleanupTimer();
    console.log('🗄️ FFL Cache Service initialized');
  }

  /**
   * Get FFL data with fallback mechanism
   */
  async getFFL(
    fflId: number,
    options: {
      allowStale?: boolean;
      forceRefresh?: boolean;
      userId?: number;
    } = {}
  ): Promise<{
    ffl: FFL | null;
    isStale: boolean;
    warning?: string;
    source: 'api' | 'cache' | 'database';
  }> {
    const { allowStale = true, forceRefresh = false } = options;

    // Check if force refresh is requested
    if (forceRefresh) {
      console.log(`🔄 Force refresh requested for FFL ${fflId}`);
      return await this.fetchAndCacheFFL(fflId);
    }

    // Step 1: Check memory cache
    const cached = this.getFromMemoryCache(fflId);
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      const isStale = age > this.TTL;
      const isTooOld = age > this.STALE_THRESHOLD;

      if (!isStale) {
        // Fresh cache hit
        this.stats.hits++;
        this.updateAccessStats(fflId);
        console.log(`✅ FFL ${fflId} served from cache (age: ${Math.round(age / 1000)}s)`);
        
        return {
          ffl: cached.data,
          isStale: false,
          source: 'cache'
        };
      } else if (allowStale && !isTooOld) {
        // Serve stale but trigger background refresh
        this.stats.staleServed++;
        this.updateAccessStats(fflId);
        console.log(`⚠️ FFL ${fflId} served stale from cache (age: ${Math.round(age / 86400000)}d)`);
        
        // Trigger background refresh (don't await)
        this.fetchAndCacheFFL(fflId).catch(err => 
          console.error(`Background FFL refresh failed for ${fflId}:`, err.message)
        );
        
        return {
          ffl: cached.data,
          isStale: true,
          warning: `FFL data is ${Math.round(age / 86400000)} days old. Consider refreshing.`,
          source: 'cache'
        };
      }
    }

    // Step 2: Cache miss - try to fetch from API/database
    this.stats.misses++;
    console.log(`❌ FFL ${fflId} cache miss, fetching...`);
    
    return await this.fetchAndCacheFFL(fflId);
  }

  /**
   * Get multiple FFLs efficiently
   */
  async getFFLs(
    fflIds: number[],
    options: {
      allowStale?: boolean;
    } = {}
  ): Promise<Map<number, FFL>> {
    const results = new Map<number, FFL>();
    const missingIds: number[] = [];

    // Check cache for each FFL
    for (const id of fflIds) {
      const result = await this.getFFL(id, options);
      if (result.ffl) {
        results.set(id, result.ffl);
      } else {
        missingIds.push(id);
      }
    }

    // Batch fetch missing FFLs from database
    if (missingIds.length > 0) {
      try {
        const dbFFLs = await db.select()
          .from(ffls)
          .where(sql`${ffls.id} IN ${missingIds}`);
        
        for (const ffl of dbFFLs) {
          results.set(ffl.id, ffl);
          // Cache for future use
          this.addToMemoryCache(ffl.id, {
            data: ffl,
            cachedAt: Date.now(),
            lastUpdated: Date.now(),
            source: 'database'
          });
        }
      } catch (error) {
        console.error('Failed to batch fetch FFLs from database:', error);
      }
    }

    return results;
  }

  /**
   * Cache FFL data explicitly
   */
  async cacheFFL(ffl: FFL): Promise<void> {
    this.addToMemoryCache(ffl.id, {
      data: ffl,
      cachedAt: Date.now(),
      lastUpdated: Date.now(),
      source: 'api'
    });
    
    // Also persist to database
    await this.persistToDatabase(ffl);
  }

  /**
   * Clear cache for specific FFL or all FFLs
   */
  clearCache(fflId?: number): void {
    if (fflId) {
      this.memoryCache.delete(fflId);
      console.log(`🗑️ Cleared cache for FFL ${fflId}`);
    } else {
      const size = this.memoryCache.size;
      this.memoryCache.clear();
      console.log(`🗑️ Cleared entire FFL cache (${size} entries)`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): FFLCacheStats & { cacheSize: number; avgAge: number } {
    let totalAge = 0;
    let count = 0;
    const now = Date.now();

    this.memoryCache.forEach(entry => {
      totalAge += (now - entry.ffl.cachedAt);
      count++;
    });

    return {
      ...this.stats,
      cacheSize: this.memoryCache.size,
      avgAge: count > 0 ? Math.round(totalAge / count / 1000) : 0 // in seconds
    };
  }

  /**
   * Check if FFL data is stale
   */
  isStale(fflId: number): boolean {
    const cached = this.memoryCache.get(fflId);
    if (!cached) return true;
    
    const age = Date.now() - cached.ffl.cachedAt;
    return age > this.TTL;
  }

  // Private methods

  private getFromMemoryCache(fflId: number): CachedFFL | null {
    const entry = this.memoryCache.get(fflId);
    return entry?.ffl || null;
  }

  private addToMemoryCache(fflId: number, ffl: CachedFFL): void {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.MAX_CACHE_SIZE) {
      this.evictLeastRecentlyUsed();
    }

    this.memoryCache.set(fflId, {
      ffl,
      accessCount: 0,
      lastAccessed: Date.now()
    });
  }

  private updateAccessStats(fflId: number): void {
    const entry = this.memoryCache.get(fflId);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestId: number | null = null;
    let oldestTime = Date.now();

    this.memoryCache.forEach((entry, id) => {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestId = id;
      }
    });

    if (oldestId !== null) {
      this.memoryCache.delete(oldestId);
      console.log(`🗑️ Evicted FFL ${oldestId} from cache (LRU)`);
    }
  }

  private async fetchAndCacheFFL(fflId: number): Promise<{
    ffl: FFL | null;
    isStale: boolean;
    warning?: string;
    source: 'api' | 'cache' | 'database';
  }> {
    try {
      // Try to fetch from database (primary source)
      const [ffl] = await db.select()
        .from(ffls)
        .where(eq(ffls.id, fflId))
        .limit(1);

      if (ffl) {
        this.stats.dbFallbacks++;
        
        // Cache the result
        this.addToMemoryCache(fflId, {
          data: ffl,
          cachedAt: Date.now(),
          lastUpdated: ffl.updatedAt?.getTime() || Date.now(),
          source: 'database'
        });

        console.log(`✅ FFL ${fflId} fetched from database and cached`);
        
        return {
          ffl,
          isStale: false,
          source: 'database'
        };
      }

      // FFL not found
      console.warn(`⚠️ FFL ${fflId} not found in database`);
      
      return {
        ffl: null,
        isStale: false,
        source: 'database'
      };

    } catch (error: any) {
      console.error(`❌ Failed to fetch FFL ${fflId}:`, error.message);
      
      // Last resort: check if we have any stale data
      const stale = this.getFromMemoryCache(fflId);
      if (stale) {
        const age = Date.now() - stale.cachedAt;
        console.log(`🔄 Serving very stale FFL ${fflId} data (age: ${Math.round(age / 86400000)}d)`);
        
        return {
          ffl: stale.data,
          isStale: true,
          warning: `Unable to refresh FFL data. Using cached data from ${Math.round(age / 86400000)} days ago.`,
          source: 'cache'
        };
      }

      return {
        ffl: null,
        isStale: false,
        warning: 'FFL data unavailable',
        source: 'database'
      };
    }
  }

  private async persistToDatabase(ffl: FFL): Promise<void> {
    try {
      // Update the FFL in database with latest data
      await db.update(ffls)
        .set({
          ...ffl,
          updatedAt: new Date()
        })
        .where(eq(ffls.id, ffl.id));
      
      console.log(`💾 FFL ${ffl.id} persisted to database`);
    } catch (error) {
      console.error(`Failed to persist FFL ${ffl.id} to database:`, error);
    }
  }

  private startCleanupTimer(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupStaleEntries();
    }, 60 * 60 * 1000);
  }

  private cleanupStaleEntries(): void {
    const now = Date.now();
    const tooOldThreshold = this.STALE_THRESHOLD * 2; // 14 days
    let cleaned = 0;

    this.memoryCache.forEach((entry, id) => {
      const age = now - entry.ffl.cachedAt;
      if (age > tooOldThreshold) {
        this.memoryCache.delete(id);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} very stale FFL cache entries`);
    }
  }

  /**
   * Warm up cache with frequently used FFLs
   */
  async warmupCache(limit = 100): Promise<void> {
    try {
      console.log('🔥 Warming up FFL cache...');
      
      // Get most recently used FFLs from orders
      const recentFFLs = await db.execute(sql`
        SELECT DISTINCT ffl_recipient_id, COUNT(*) as usage_count
        FROM orders
        WHERE ffl_recipient_id IS NOT NULL
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY ffl_recipient_id
        ORDER BY usage_count DESC
        LIMIT ${limit}
      `);

      const fflIds = recentFFLs.rows.map((row: any) => row.ffl_recipient_id);
      
      if (fflIds.length > 0) {
        const cached = await this.getFFLs(fflIds);
        console.log(`✅ FFL cache warmed up with ${cached.size} entries`);
      } else {
        console.log('ℹ️ No recent FFLs to warm up cache');
      }
    } catch (error) {
      console.error('Failed to warm up FFL cache:', error);
    }
  }
}

// Export singleton instance
export const fflCacheService = new FFLCacheService();