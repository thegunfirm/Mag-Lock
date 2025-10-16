/**
 * Test Utilities and Helper Functions
 * Common utilities for E2E testing
 */

import { db } from '../db';
import { 
  orders, 
  users, 
  localUsers, 
  products, 
  ffls, 
  carts,
  orderLines 
} from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import type { CartItem } from '../firearms-compliance-service';

// Test data prefixes to easily identify and clean up
const TEST_PREFIX = 'TEST_E2E_';

/**
 * Test User Generator
 */
export class TestUserGenerator {
  static async createTestUser(options: {
    email?: string;
    firstName?: string;
    lastName?: string;
    membershipTier?: string;
    state?: string;
  } = {}) {
    const timestamp = Date.now();
    const userData = {
      id: `${TEST_PREFIX}USER_${timestamp}`,
      email: options.email || `${TEST_PREFIX}user_${timestamp}@test.com`,
      passwordHash: await bcrypt.hash('testpass123', 10),
      firstName: options.firstName || 'Test',
      lastName: options.lastName || 'User',
      membershipTier: options.membershipTier || 'Bronze',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
      isTestAccount: true,
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: options.state || 'TX',
        zip: '12345',
        country: 'US'
      }
    };

    const [user] = await db.insert(localUsers).values(userData).returning();
    return user;
  }

  static async cleanupTestUsers() {
    await db.delete(localUsers).where(
      sql`${localUsers.id} LIKE ${TEST_PREFIX + 'USER_%'}`
    );
  }
}

/**
 * Test Product Generator
 */
export class TestProductGenerator {
  static async createFirearmProduct(options: {
    name?: string;
    sku?: string;
    capacity?: number;
    fulfillmentSource?: string;
  } = {}) {
    const timestamp = Date.now();
    const productData = {
      name: options.name || `${TEST_PREFIX}Glock 19 Gen5`,
      sku: options.sku || `${TEST_PREFIX}G19G5_${timestamp}`,
      category: 'Handguns',
      manufacturer: 'Glock',
      priceWholesale: '499.00',
      priceMAP: '549.00',
      priceMSRP: '599.00',
      priceBronze: '599.00',
      priceGold: '549.00',
      pricePlatinum: '519.00',
      inStock: true,
      stockQuantity: 10,
      requiresFFL: true,
      isFirearm: true,
      capacity: options.capacity || 15,
      fulfillmentSource: options.fulfillmentSource || 'rsr',
      rsrStockNumber: `RSR_${timestamp}`,
      distributor: 'RSR'
    };

    const [product] = await db.insert(products).values(productData).returning();
    return product;
  }

  static async createAccessoryProduct(options: {
    name?: string;
    sku?: string;
  } = {}) {
    const timestamp = Date.now();
    const productData = {
      name: options.name || `${TEST_PREFIX}Holster`,
      sku: options.sku || `${TEST_PREFIX}HOLSTER_${timestamp}`,
      category: 'Accessories',
      manufacturer: 'Generic',
      priceWholesale: '29.00',
      priceMAP: '39.00',
      priceMSRP: '49.00',
      priceBronze: '49.00',
      priceGold: '39.00',
      pricePlatinum: '34.00',
      inStock: true,
      stockQuantity: 50,
      requiresFFL: false,
      isFirearm: false,
      distributor: 'RSR'
    };

    const [product] = await db.insert(products).values(productData).returning();
    return product;
  }

  static async createHighCapacityMagazine(capacity: number = 30) {
    const timestamp = Date.now();
    const productData = {
      name: `${TEST_PREFIX}Magazine ${capacity}rd`,
      sku: `${TEST_PREFIX}MAG${capacity}_${timestamp}`,
      category: 'Magazines',
      manufacturer: 'Magpul',
      priceWholesale: '15.00',
      priceMAP: '20.00',
      priceMSRP: '25.00',
      priceBronze: '25.00',
      priceGold: '20.00',
      pricePlatinum: '17.00',
      inStock: true,
      stockQuantity: 100,
      requiresFFL: false,
      isFirearm: false,
      capacity: capacity,
      distributor: 'RSR'
    };

    const [product] = await db.insert(products).values(productData).returning();
    return product;
  }

  static async cleanupTestProducts() {
    await db.delete(products).where(
      sql`${products.name} LIKE ${TEST_PREFIX + '%'}`
    );
  }
}

/**
 * Test FFL Generator
 */
export class TestFFLGenerator {
  static async createTestFFL(options: {
    businessName?: string;
    state?: string;
  } = {}) {
    const timestamp = Date.now();
    const fflData = {
      businessName: options.businessName || `${TEST_PREFIX}FFL Dealer ${timestamp}`,
      licenseNumber: `1-23-456-78-9A-${timestamp}`,
      licenseType: '01',
      contactEmail: `${TEST_PREFIX}ffl_${timestamp}@test.com`,
      phone: '555-0123',
      address: {
        street: '456 FFL St',
        city: 'Gun City',
        state: options.state || 'TX',
        zip: '54321'
      },
      zip: '54321', // Required field at table level
      mailingAddress: {
        street: '456 FFL St',
        city: 'Gun City',
        state: options.state || 'TX',
        zip: '54321'
      },
      status: 'OnFile',
      isRsrPartner: false,
      isAtfActive: true,
      licenseExpiration: new Date('2025-12-31'),
      isAvailableToUser: true
    };

    const [ffl] = await db.insert(ffls).values(fflData).returning();
    return ffl;
  }

  static async cleanupTestFFLs() {
    await db.delete(ffls).where(
      sql`${ffls.businessName} LIKE ${TEST_PREFIX + '%'}`
    );
  }
}

/**
 * Mock External Services
 */
export class MockExternalServices {
  private static rsrApiEnabled = true;
  private static fflApiEnabled = true;
  private static rsrApiResponseTime = 100;
  private static fflApiResponseTime = 100;

  static disableRSRAPI() {
    this.rsrApiEnabled = false;
  }

  static enableRSRAPI() {
    this.rsrApiEnabled = true;
  }

  static disableFFLAPI() {
    this.fflApiEnabled = false;
  }

  static enableFFLAPI() {
    this.fflApiEnabled = true;
  }

  static setRSRAPIResponseTime(ms: number) {
    this.rsrApiResponseTime = ms;
  }

  static async mockRSRAPICall(endpoint: string, data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, this.rsrApiResponseTime));
    
    if (!this.rsrApiEnabled) {
      throw new Error('RSR API is currently unavailable');
    }

    // Mock successful responses
    if (endpoint === 'inventory') {
      return {
        success: true,
        inventory: [
          { sku: data.sku, quantity: 100, price: 499.00 }
        ]
      };
    }

    if (endpoint === 'order') {
      return {
        success: true,
        orderNumber: `RSR-${Date.now()}`,
        status: 'confirmed'
      };
    }

    return { success: true };
  }

  static async mockFFLAPICall(licenseNumber: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, this.fflApiResponseTime));
    
    if (!this.fflApiEnabled) {
      throw new Error('FFL API is currently unavailable');
    }

    return {
      success: true,
      ffl: {
        licenseNumber,
        businessName: 'Mock FFL Dealer',
        verified: true
      }
    };
  }
}

/**
 * Order Test Helper
 */
export class OrderTestHelper {
  static async createTestOrder(options: {
    userId: string;
    items: CartItem[];
    fflRecipientId?: number;
    status?: string;
    ihStatus?: string;
  }) {
    const orderData = {
      userId: parseInt(options.userId.split('_').pop() || '0'),
      totalPrice: options.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2),
      status: options.status || 'Paid',
      items: options.items,
      fflRecipientId: options.fflRecipientId,
      ihStatus: options.ihStatus,
      ihMeta: {},
      fulfillmentGroups: [],
      orderDate: new Date(),
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TX',
        zip: '12345'
      }
    };

    const [order] = await db.insert(orders).values(orderData).returning();
    return order;
  }

  static async updateIHStatus(orderId: number, newStatus: string, meta?: any) {
    const validTransitions: Record<string, string[]> = {
      'null': ['RECEIVED_FROM_RSR'],
      'RECEIVED_FROM_RSR': ['SENT_OUTBOUND'],
      'SENT_OUTBOUND': ['ORDER_COMPLETE']
    };

    // Get current status
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    const currentStatus = order.ihStatus || 'null';
    
    // Check if transition is valid
    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    // Update status
    await db.update(orders)
      .set({
        ihStatus: newStatus,
        ihMeta: meta || order.ihMeta,
        updatedAt: new Date()
      })
      .where(eq(orders.id, orderId));

    return { success: true };
  }

  static async cleanupTestOrders() {
    // Find all test orders by looking for test user IDs
    const testUserIds = await db
      .select({ id: localUsers.id })
      .from(localUsers)
      .where(sql`${localUsers.id} LIKE ${TEST_PREFIX + '%'}`);

    if (testUserIds.length > 0) {
      const userIdNumbers = testUserIds.map(u => parseInt(u.id.split('_').pop() || '0'));
      await db.delete(orders).where(
        sql`${orders.userId} IN (${sql.join(userIdNumbers, sql`, `)})`
      );
    }
  }
}

/**
 * Test Result Reporter
 */
export class TestReporter {
  private results: Array<{
    testName: string;
    passed: boolean;
    duration: number;
    error?: string;
    details?: any;
  }> = [];

  addResult(testName: string, passed: boolean, duration: number, error?: string, details?: any) {
    this.results.push({ testName, passed, duration, error, details });
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total Duration: ${totalDuration.toFixed(2)}ms`);
    console.log('');

    // Print individual results
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.testName} (${result.duration.toFixed(2)}ms)`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    });

    console.log('='.repeat(60));

    return {
      passed,
      failed,
      total: this.results.length,
      results: this.results
    };
  }

  exportJSON(): string {
    return JSON.stringify(this.results, null, 2);
  }
}

/**
 * Test Database Cleanup
 */
export async function cleanupAllTestData() {
  console.log('🧹 Cleaning up all test data...');
  
  await TestUserGenerator.cleanupTestUsers();
  await TestProductGenerator.cleanupTestProducts();
  await TestFFLGenerator.cleanupTestFFLs();
  await OrderTestHelper.cleanupTestOrders();
  
  console.log('✅ Test data cleanup complete');
}

/**
 * Test Timer Utility
 */
export class TestTimer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.startTime;
  }

  reset() {
    this.startTime = Date.now();
  }
}

/**
 * State compliance test utilities
 */
export class StateComplianceTestHelper {
  static getBlockedStates() {
    return ['CA']; // California completely blocks firearms
  }

  static getCapacityLimitedStates() {
    return [
      { state: 'MA', limit: 10 },
      { state: 'NY', limit: 10 },
      { state: 'NJ', limit: 10 },
      { state: 'CT', limit: 10 }
    ];
  }

  static async createCAUser() {
    return TestUserGenerator.createTestUser({
      state: 'CA',
      email: `${TEST_PREFIX}california_user@test.com`
    });
  }

  static async createMAUser() {
    return TestUserGenerator.createTestUser({
      state: 'MA',
      email: `${TEST_PREFIX}massachusetts_user@test.com`
    });
  }

  static async createTXUser() {
    return TestUserGenerator.createTestUser({
      state: 'TX',
      email: `${TEST_PREFIX}texas_user@test.com`
    });
  }
}

export default {
  TestUserGenerator,
  TestProductGenerator,
  TestFFLGenerator,
  MockExternalServices,
  OrderTestHelper,
  TestReporter,
  TestTimer,
  StateComplianceTestHelper,
  cleanupAllTestData
};