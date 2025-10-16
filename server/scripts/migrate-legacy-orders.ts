#!/usr/bin/env tsx
/**
 * Migration Script for Legacy Orders
 * 
 * This script safely backfills legacy orders with new schema fields:
 * - ihStatus: null (only set for actual IH orders)
 * - ihMeta: {} (empty object)
 * - fulfillmentGroups: Generate based on order items (firearms vs non-firearms)
 * - persistedFfl: Extract from existing fflRecipientId if present
 * 
 * The script is idempotent and can be run multiple times safely.
 */

import { db } from '../db';
import { orders, ffls, products } from '@shared/schema';
import { eq, isNull, sql, and, or, inArray } from 'drizzle-orm';
import { determineFulfillmentSource } from '../config/ih-sku-allowlist';

interface MigrationStats {
  totalOrders: number;
  ordersProcessed: number;
  ordersSkipped: number;
  ordersWithFFL: number;
  ordersWithFulfillmentGroups: number;
  errors: Array<{ orderId: number; error: string }>;
}

interface FulfillmentGroup {
  type: 'ih_ffl' | 'ds_ffl' | 'ds_customer';
  items: Array<{
    productId: number;
    productName: string;
    sku: string;
    quantity: number;
    price: number;
    requiresFFL?: boolean;
  }>;
  destinationType: 'ffl' | 'customer';
  fulfillmentSource: 'ih' | 'rsr' | 'ds';
}

class LegacyOrderMigration {
  private stats: MigrationStats = {
    totalOrders: 0,
    ordersProcessed: 0,
    ordersSkipped: 0,
    ordersWithFFL: 0,
    ordersWithFulfillmentGroups: 0,
    errors: []
  };

  private dryRun: boolean;
  private batchSize: number;
  private testLimit: number | null;

  constructor(options: {
    dryRun?: boolean;
    batchSize?: number;
    testLimit?: number | null;
  } = {}) {
    this.dryRun = options.dryRun ?? false;
    this.batchSize = options.batchSize ?? 50;
    this.testLimit = options.testLimit ?? null;
  }

  /**
   * Run the migration
   */
  async run(): Promise<MigrationStats> {
    console.log('🚀 Starting legacy order migration...');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Batch size: ${this.batchSize}`);
    console.log(`Test limit: ${this.testLimit || 'No limit'}`);
    console.log('');

    try {
      // Get total count of orders
      const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM orders`);
      this.stats.totalOrders = Number(countResult.rows[0].count);
      console.log(`Found ${this.stats.totalOrders} total orders`);

      // Process orders in batches
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const limit = this.testLimit 
          ? Math.min(this.batchSize, this.testLimit - this.stats.ordersProcessed)
          : this.batchSize;

        if (limit <= 0) break;

        const batch = await this.fetchOrderBatch(offset, limit);
        
        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        await this.processBatch(batch);
        offset += batch.length;

        // Check if we've hit test limit
        if (this.testLimit && this.stats.ordersProcessed >= this.testLimit) {
          console.log(`\n✅ Reached test limit of ${this.testLimit} orders`);
          break;
        }

        // Progress update
        const progress = ((this.stats.ordersProcessed / (this.testLimit || this.stats.totalOrders)) * 100).toFixed(1);
        console.log(`Progress: ${this.stats.ordersProcessed}/${this.testLimit || this.stats.totalOrders} (${progress}%)`);
      }

      this.printSummary();
      return this.stats;

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Fetch a batch of orders
   */
  private async fetchOrderBatch(offset: number, limit: number) {
    return await db
      .select({
        id: orders.id,
        items: orders.items,
        fflRecipientId: orders.fflRecipientId,
        ihStatus: orders.ihStatus,
        ihMeta: orders.ihMeta,
        fulfillmentGroups: orders.fulfillmentGroups,
        persistedFfl: orders.persistedFfl,
        rsrOrderNumber: orders.rsrOrderNumber,
        status: orders.status
      })
      .from(orders)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Process a batch of orders
   */
  private async processBatch(batch: any[]) {
    for (const order of batch) {
      try {
        await this.migrateOrder(order);
      } catch (error: any) {
        console.error(`❌ Error processing order ${order.id}:`, error.message);
        this.stats.errors.push({
          orderId: order.id,
          error: error.message
        });
      }
    }
  }

  /**
   * Migrate a single order
   */
  private async migrateOrder(order: any) {
    const updates: any = {};
    let needsUpdate = false;

    // 1. Set ihStatus to null if not already set (unless it's an actual IH order)
    if (order.ihStatus === undefined || order.ihStatus === '') {
      // Check if this is an IH order based on RSR order number pattern or other criteria
      const isIHOrder = order.rsrOrderNumber && order.rsrOrderNumber.startsWith('IH-');
      updates.ihStatus = isIHOrder ? 'RECEIVED_FROM_RSR' : null;
      needsUpdate = true;
    }

    // 2. Set ihMeta to empty object if null or undefined
    if (order.ihMeta === null || order.ihMeta === undefined) {
      updates.ihMeta = {};
      needsUpdate = true;
    }

    // 3. Generate fulfillmentGroups if missing
    if (!order.fulfillmentGroups || (Array.isArray(order.fulfillmentGroups) && order.fulfillmentGroups.length === 0)) {
      const fulfillmentGroups = await this.generateFulfillmentGroups(order);
      if (fulfillmentGroups.length > 0) {
        updates.fulfillmentGroups = fulfillmentGroups;
        this.stats.ordersWithFulfillmentGroups++;
        needsUpdate = true;
      }
    }

    // 4. Extract and persist FFL data if fflRecipientId exists but persistedFfl is missing
    if (order.fflRecipientId && !order.persistedFfl) {
      const persistedFfl = await this.extractFFLData(order.fflRecipientId);
      if (persistedFfl) {
        updates.persistedFfl = persistedFfl;
        this.stats.ordersWithFFL++;
        needsUpdate = true;
      }
    }

    // Apply updates if needed
    if (needsUpdate) {
      if (!this.dryRun) {
        await db
          .update(orders)
          .set({
            ...updates,
            updatedAt: new Date()
          })
          .where(eq(orders.id, order.id));
      }
      
      console.log(`✅ Order ${order.id}: Updated ${Object.keys(updates).join(', ')}`);
      this.stats.ordersProcessed++;
    } else {
      console.log(`⏭️  Order ${order.id}: No updates needed`);
      this.stats.ordersSkipped++;
    }
  }

  /**
   * Generate fulfillment groups based on order items
   */
  private async generateFulfillmentGroups(order: any): Promise<FulfillmentGroup[]> {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    if (!items || items.length === 0) return [];

    const groups: Map<string, FulfillmentGroup> = new Map();

    // Fetch product details for all items
    const productIds = items.map((item: any) => item.productId).filter(Boolean);
    if (productIds.length === 0) return [];

    const productDetails = await db
      .select({
        id: products.id,
        sku: products.sku,
        rsrStockNumber: products.rsrStockNumber,
        isFirearm: products.isFirearm,
        requiresFFL: products.requiresFFL,
        fulfillmentSource: products.fulfillmentSource
      })
      .from(products)
      .where(inArray(products.id, productIds));

    const productMap = new Map(productDetails.map(p => [p.id, p]));

    // Group items by fulfillment type
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) continue;

      // Determine fulfillment source
      const source = determineFulfillmentSource({
        fulfillmentSource: product.fulfillmentSource,
        sku: product.sku,
        rsrStockNumber: product.rsrStockNumber,
        isFirearm: product.isFirearm,
        requiresFFL: product.requiresFFL
      });

      // Determine group type
      let groupType: 'ih_ffl' | 'ds_ffl' | 'ds_customer';
      if (product.requiresFFL || product.isFirearm) {
        groupType = source === 'ih' ? 'ih_ffl' : 'ds_ffl';
      } else {
        groupType = 'ds_customer';
      }

      // Get or create group
      if (!groups.has(groupType)) {
        groups.set(groupType, {
          type: groupType,
          items: [],
          destinationType: groupType.includes('ffl') ? 'ffl' : 'customer',
          fulfillmentSource: groupType === 'ih_ffl' ? 'ih' : (groupType === 'ds_ffl' ? 'rsr' : 'ds')
        });
      }

      const group = groups.get(groupType)!;
      group.items.push({
        productId: item.productId,
        productName: item.name || item.productName,
        sku: product.sku || item.sku,
        quantity: item.quantity,
        price: item.price,
        requiresFFL: product.requiresFFL || product.isFirearm || false
      });
    }

    return Array.from(groups.values());
  }

  /**
   * Extract FFL data for persistence
   */
  private async extractFFLData(fflRecipientId: number) {
    const [ffl] = await db
      .select({
        id: ffls.id,
        businessName: ffls.businessName,
        licenseNumber: ffls.licenseNumber,
        contactName: ffls.contactName,
        contactEmail: ffls.contactEmail,
        phone: ffls.phone,
        address: ffls.address,
        preferredBy: ffls.preferredBy,
        expirationDate: ffls.expirationDate
      })
      .from(ffls)
      .where(eq(ffls.id, fflRecipientId))
      .limit(1);

    return ffl || null;
  }

  /**
   * Print migration summary
   */
  private printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total orders in database: ${this.stats.totalOrders}`);
    console.log(`Orders processed: ${this.stats.ordersProcessed}`);
    console.log(`Orders skipped (no changes): ${this.stats.ordersSkipped}`);
    console.log(`Orders with FFL data persisted: ${this.stats.ordersWithFFL}`);
    console.log(`Orders with fulfillment groups generated: ${this.stats.ordersWithFulfillmentGroups}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${this.stats.errors.length}`);
      this.stats.errors.forEach(err => {
        console.log(`  - Order ${err.orderId}: ${err.error}`);
      });
    }

    if (this.dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes were saved to the database');
      console.log('Run with --live flag to apply changes');
    }

    console.log('='.repeat(60));
  }
}

// CLI execution
const args = process.argv.slice(2);
const isDryRun = !args.includes('--live');
const testLimit = args.includes('--test') ? 10 : null;
const customLimit = args.find(arg => arg.startsWith('--limit='));
const limit = customLimit ? parseInt(customLimit.split('=')[1]) : testLimit;

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migration = new LegacyOrderMigration({
    dryRun: isDryRun,
    batchSize: 50,
    testLimit: limit
  });

  migration.run()
    .then(() => {
      console.log('\n✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

export { LegacyOrderMigration };