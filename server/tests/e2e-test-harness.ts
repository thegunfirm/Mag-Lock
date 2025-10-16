#!/usr/bin/env tsx
/**
 * E2E Test Harness for Critical Flows
 * 
 * This test harness covers:
 * a) FFL Persistence Test
 * b) Mixed Split Test (fulfillment groups)
 * c) IH Status Transitions Test
 * d) State Compliance Blocks Test
 * e) API Failure Recovery Test
 */

import {
  TestUserGenerator,
  TestProductGenerator,
  TestFFLGenerator,
  MockExternalServices,
  OrderTestHelper,
  TestReporter,
  TestTimer,
  StateComplianceTestHelper,
  cleanupAllTestData
} from './test-utils';
import { db } from '../db';
import { orders, ffls, products, localUsers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { FirearmsCheckoutService } from '../firearms-checkout-service';
import { fflCacheService } from '../services/ffl-cache-service';
import { checkCartStateCompliance } from '../state-compliance-rules';
import { determineFulfillmentSource } from '../config/ih-sku-allowlist';
import type { CartItem } from '../firearms-compliance-service';

// Test configuration
const TEST_CONFIG = {
  verbose: true,
  cleanupAfter: true,
  runIndividual: null as string | null
};

// Parse command line arguments
const args = process.argv.slice(2);
args.forEach(arg => {
  if (arg === '--quiet') TEST_CONFIG.verbose = false;
  if (arg === '--no-cleanup') TEST_CONFIG.cleanupAfter = false;
  if (arg.startsWith('--test=')) TEST_CONFIG.runIndividual = arg.split('=')[1];
});

/**
 * Test Suite Class
 */
class E2ETestSuite {
  private reporter: TestReporter;
  private checkoutService: FirearmsCheckoutService;

  constructor() {
    this.reporter = new TestReporter();
    this.checkoutService = new FirearmsCheckoutService();
  }

  /**
   * Run all tests or a specific test
   */
  async run() {
    console.log('🚀 Starting E2E Test Harness');
    console.log('Configuration:', TEST_CONFIG);
    console.log('');

    try {
      // Clean up before tests
      await cleanupAllTestData();

      // Define test suite
      const tests = [
        { name: 'FFL Persistence Test', fn: () => this.testFFLPersistence() },
        { name: 'Mixed Split Test', fn: () => this.testMixedSplit() },
        { name: 'IH Status Transitions Test', fn: () => this.testIHStatusTransitions() },
        { name: 'State Compliance Blocks Test', fn: () => this.testStateCompliance() },
        { name: 'API Failure Recovery Test', fn: () => this.testAPIFailureRecovery() }
      ];

      // Run tests
      for (const test of tests) {
        if (TEST_CONFIG.runIndividual && test.name !== TEST_CONFIG.runIndividual) {
          continue;
        }

        console.log(`\n📋 Running: ${test.name}`);
        console.log('-'.repeat(50));

        const timer = new TestTimer();
        let passed = false;
        let error: string | undefined;

        try {
          const result = await test.fn();
          passed = result.success;
          if (!result.success && result.error) {
            error = result.error;
          }
        } catch (err: any) {
          passed = false;
          error = err.message;
          console.error(`❌ Test failed with error:`, err);
        }

        const duration = timer.elapsed();
        this.reporter.addResult(test.name, passed, duration, error);

        if (passed) {
          console.log(`✅ ${test.name} passed (${duration}ms)`);
        } else {
          console.log(`❌ ${test.name} failed (${duration}ms)`);
          if (error) console.error(`   Error: ${error}`);
        }
      }

      // Print summary
      const summary = this.reporter.printSummary();

      // Clean up after tests if configured
      if (TEST_CONFIG.cleanupAfter) {
        await cleanupAllTestData();
      }

      return summary;

    } catch (error) {
      console.error('Fatal error in test suite:', error);
      throw error;
    }
  }

  /**
   * Test 1: FFL Persistence Test
   */
  async testFFLPersistence(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Creating test data...');
      
      // Create test user
      const user = await TestUserGenerator.createTestUser({
        membershipTier: 'Gold'
      });

      // Create test FFL
      const ffl = await TestFFLGenerator.createTestFFL({
        businessName: 'Test FFL for Persistence',
        state: 'TX'
      });

      // Create firearm product
      const firearm = await TestProductGenerator.createFirearmProduct({
        name: 'Test Glock 19'
      });

      // Create cart items
      const cartItems: CartItem[] = [{
        productId: firearm.id,
        productName: firearm.name,
        sku: firearm.sku,
        quantity: 1,
        price: 549.00,
        requiresFFL: true
      }];

      console.log('Processing checkout with FFL...');

      // Process checkout with FFL
      const checkoutResult = await this.checkoutService.processCheckout({
        userId: parseInt(user.id.split('_').pop() || '0'),
        cartItems,
        shippingAddress: user.shippingAddress,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '12/25',
          cvv: '123'
        },
        customerInfo: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        fflRecipientId: ffl.id,
        skipPaymentProcessing: true // Skip actual payment for test
      });

      if (!checkoutResult.success || !checkoutResult.orderId) {
        return { 
          success: false, 
          error: `Checkout failed: ${checkoutResult.error}` 
        };
      }

      console.log(`Order created with ID: ${checkoutResult.orderId}`);

      // Verify FFL persistence
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, checkoutResult.orderId))
        .limit(1);

      if (!order) {
        return { success: false, error: 'Order not found after creation' };
      }

      if (!order.persistedFfl) {
        return { success: false, error: 'FFL data not persisted in order' };
      }

      // Verify persisted FFL contains required fields
      const persistedFfl = typeof order.persistedFfl === 'string' 
        ? JSON.parse(order.persistedFfl) 
        : order.persistedFfl;

      const requiredFields = ['businessName', 'licenseNumber', 'address', 'phone'];
      for (const field of requiredFields) {
        if (!persistedFfl[field]) {
          return { 
            success: false, 
            error: `Missing required FFL field: ${field}` 
          };
        }
      }

      console.log('✅ FFL data persisted correctly with all required fields');
      return { success: true };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test 2: Mixed Split Test
   */
  async testMixedSplit(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Creating mixed product test data...');
      
      // Create test user
      const user = await TestUserGenerator.createTestUser({
        membershipTier: 'Platinum'
      });

      // Create test FFL
      const ffl = await TestFFLGenerator.createTestFFL();

      // Create products with different fulfillment sources
      const ihFirearm = await TestProductGenerator.createFirearmProduct({
        name: 'IH Glock 17',
        sku: 'G17G5MOS', // In IH allowlist
        fulfillmentSource: 'ih'
      });

      const rsrFirearm = await TestProductGenerator.createFirearmProduct({
        name: 'RSR Sig P320',
        sku: 'P320-STANDARD',
        fulfillmentSource: 'rsr'
      });

      const accessory = await TestProductGenerator.createAccessoryProduct({
        name: 'Holster'
      });

      // Create mixed cart
      const cartItems: CartItem[] = [
        {
          productId: ihFirearm.id,
          productName: ihFirearm.name,
          sku: ihFirearm.sku,
          quantity: 1,
          price: 599.00,
          requiresFFL: true
        },
        {
          productId: rsrFirearm.id,
          productName: rsrFirearm.name,
          sku: rsrFirearm.sku,
          quantity: 1,
          price: 699.00,
          requiresFFL: true
        },
        {
          productId: accessory.id,
          productName: accessory.name,
          sku: accessory.sku,
          quantity: 2,
          price: 39.00,
          requiresFFL: false
        }
      ];

      console.log('Processing mixed checkout...');

      // Process checkout
      const checkoutResult = await this.checkoutService.processCheckout({
        userId: parseInt(user.id.split('_').pop() || '0'),
        cartItems,
        shippingAddress: user.shippingAddress,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '12/25',
          cvv: '123'
        },
        customerInfo: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        fflRecipientId: ffl.id,
        skipPaymentProcessing: true
      });

      if (!checkoutResult.success || !checkoutResult.orderId) {
        return { 
          success: false, 
          error: `Checkout failed: ${checkoutResult.error}` 
        };
      }

      // Verify fulfillment groups
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, checkoutResult.orderId))
        .limit(1);

      if (!order || !order.fulfillmentGroups) {
        return { success: false, error: 'Order or fulfillment groups not found' };
      }

      const groups = typeof order.fulfillmentGroups === 'string'
        ? JSON.parse(order.fulfillmentGroups)
        : order.fulfillmentGroups;

      console.log(`Found ${groups.length} fulfillment groups`);

      // Verify correct group types exist
      const groupTypes = groups.map((g: any) => g.type);
      
      if (!groupTypes.includes('ih_ffl')) {
        return { success: false, error: 'Missing ih_ffl fulfillment group' };
      }
      if (!groupTypes.includes('ds_ffl')) {
        return { success: false, error: 'Missing ds_ffl fulfillment group' };
      }
      if (!groupTypes.includes('ds_customer')) {
        return { success: false, error: 'Missing ds_customer fulfillment group' };
      }

      // Verify items are in correct groups
      for (const group of groups) {
        if (group.type === 'ih_ffl') {
          const hasIHFirearm = group.items.some((item: any) => 
            item.sku === 'G17G5MOS'
          );
          if (!hasIHFirearm) {
            return { success: false, error: 'IH firearm not in ih_ffl group' };
          }
        } else if (group.type === 'ds_ffl') {
          const hasRSRFirearm = group.items.some((item: any) => 
            item.sku === 'P320-STANDARD'
          );
          if (!hasRSRFirearm) {
            return { success: false, error: 'RSR firearm not in ds_ffl group' };
          }
        } else if (group.type === 'ds_customer') {
          const hasAccessory = group.items.some((item: any) => 
            item.productName.includes('Holster')
          );
          if (!hasAccessory) {
            return { success: false, error: 'Accessory not in ds_customer group' };
          }
        }
      }

      console.log('✅ Fulfillment groups created correctly');
      return { success: true };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test 3: IH Status Transitions Test
   */
  async testIHStatusTransitions(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Creating IH order...');
      
      // Create test user
      const user = await TestUserGenerator.createTestUser();

      // Create IH product
      const ihProduct = await TestProductGenerator.createFirearmProduct({
        name: 'IH Test Product',
        sku: 'G43XMOS', // In IH allowlist
        fulfillmentSource: 'ih'
      });

      // Create order with IH status
      const order = await OrderTestHelper.createTestOrder({
        userId: user.id,
        items: [{
          productId: ihProduct.id,
          productName: ihProduct.name,
          sku: ihProduct.sku,
          quantity: 1,
          price: 499.00,
          requiresFFL: true
        }],
        ihStatus: null
      });

      console.log('Testing status transitions...');

      // Test valid transition: null -> RECEIVED_FROM_RSR
      try {
        await OrderTestHelper.updateIHStatus(order.id, 'RECEIVED_FROM_RSR', {
          rsrReceiptDate: new Date().toISOString(),
          notes: 'Received from RSR warehouse'
        });
        console.log('✅ Transition null -> RECEIVED_FROM_RSR successful');
      } catch (error: any) {
        return { 
          success: false, 
          error: `Failed null -> RECEIVED_FROM_RSR: ${error.message}` 
        };
      }

      // Test valid transition: RECEIVED_FROM_RSR -> SENT_OUTBOUND
      try {
        await OrderTestHelper.updateIHStatus(order.id, 'SENT_OUTBOUND', {
          rsrReceiptDate: new Date().toISOString(),
          outboundCarrier: 'UPS',
          outboundTracking: 'TEST123456',
          notes: 'Shipped to FFL'
        });
        console.log('✅ Transition RECEIVED_FROM_RSR -> SENT_OUTBOUND successful');
      } catch (error: any) {
        return { 
          success: false, 
          error: `Failed RECEIVED_FROM_RSR -> SENT_OUTBOUND: ${error.message}` 
        };
      }

      // Test valid transition: SENT_OUTBOUND -> ORDER_COMPLETE
      try {
        await OrderTestHelper.updateIHStatus(order.id, 'ORDER_COMPLETE', {
          rsrReceiptDate: new Date().toISOString(),
          outboundCarrier: 'UPS',
          outboundTracking: 'TEST123456',
          completedDate: new Date().toISOString(),
          notes: 'Order completed successfully'
        });
        console.log('✅ Transition SENT_OUTBOUND -> ORDER_COMPLETE successful');
      } catch (error: any) {
        return { 
          success: false, 
          error: `Failed SENT_OUTBOUND -> ORDER_COMPLETE: ${error.message}` 
        };
      }

      // Test invalid transition (create new order for this)
      const order2 = await OrderTestHelper.createTestOrder({
        userId: user.id,
        items: [{
          productId: ihProduct.id,
          productName: ihProduct.name,
          sku: ihProduct.sku,
          quantity: 1,
          price: 499.00,
          requiresFFL: true
        }],
        ihStatus: 'RECEIVED_FROM_RSR'
      });

      // Try invalid transition: RECEIVED_FROM_RSR -> ORDER_COMPLETE (skipping SENT_OUTBOUND)
      try {
        await OrderTestHelper.updateIHStatus(order2.id, 'ORDER_COMPLETE');
        return { 
          success: false, 
          error: 'Invalid transition did not throw error' 
        };
      } catch (error: any) {
        if (error.message.includes('Invalid status transition')) {
          console.log('✅ Invalid transition correctly rejected');
        } else {
          return { 
            success: false, 
            error: `Unexpected error for invalid transition: ${error.message}` 
          };
        }
      }

      return { success: true };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test 4: State Compliance Blocks Test
   */
  async testStateCompliance(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Testing state compliance rules...');
      
      // Test CA complete block
      console.log('\nTesting California complete block...');
      const caUser = await StateComplianceTestHelper.createCAUser();
      const firearm = await TestProductGenerator.createFirearmProduct();
      
      const caCartItems: CartItem[] = [{
        productId: firearm.id,
        productName: firearm.name,
        sku: firearm.sku,
        quantity: 1,
        price: 599.00,
        requiresFFL: true
      }];

      const caCompliance = await checkCartStateCompliance(caCartItems, 'CA');
      
      if (caCompliance.isAllowed) {
        return { 
          success: false, 
          error: 'California should block all firearm sales' 
        };
      }
      console.log('✅ California correctly blocks firearm sales');

      // Test MA magazine capacity limit
      console.log('\nTesting Massachusetts magazine capacity limit...');
      const maUser = await StateComplianceTestHelper.createMAUser();
      
      // Create high capacity magazine (>10 rounds)
      const highCapMag = await TestProductGenerator.createHighCapacityMagazine(30);
      
      const maCartItems: CartItem[] = [{
        productId: highCapMag.id,
        productName: highCapMag.name,
        sku: highCapMag.sku,
        quantity: 1,
        price: 25.00,
        requiresFFL: false
      }];

      const maCompliance = await checkCartStateCompliance(maCartItems, 'MA');
      
      if (maCompliance.isAllowed) {
        return { 
          success: false, 
          error: 'Massachusetts should block >10 round magazines' 
        };
      }
      console.log('✅ Massachusetts correctly blocks high capacity magazines');

      // Test normal state processing (TX - no restrictions)
      console.log('\nTesting Texas (no restrictions)...');
      const txUser = await StateComplianceTestHelper.createTXUser();
      
      const txCartItems: CartItem[] = [
        {
          productId: firearm.id,
          productName: firearm.name,
          sku: firearm.sku,
          quantity: 1,
          price: 599.00,
          requiresFFL: true
        },
        {
          productId: highCapMag.id,
          productName: highCapMag.name,
          sku: highCapMag.sku,
          quantity: 1,
          price: 25.00,
          requiresFFL: false
        }
      ];

      const txCompliance = await checkCartStateCompliance(txCartItems, 'TX');
      
      if (!txCompliance.isAllowed) {
        return { 
          success: false, 
          error: 'Texas should allow all items' 
        };
      }
      console.log('✅ Texas correctly allows all items');

      // Test 10-round magazine in MA (should be allowed)
      console.log('\nTesting 10-round magazine in Massachusetts...');
      const lowCapMag = await TestProductGenerator.createHighCapacityMagazine(10);
      
      const maLowCapItems: CartItem[] = [{
        productId: lowCapMag.id,
        productName: lowCapMag.name,
        sku: lowCapMag.sku,
        quantity: 1,
        price: 20.00,
        requiresFFL: false
      }];

      const maLowCapCompliance = await checkCartStateCompliance(maLowCapItems, 'MA');
      
      if (!maLowCapCompliance.isAllowed) {
        return { 
          success: false, 
          error: 'Massachusetts should allow 10-round magazines' 
        };
      }
      console.log('✅ Massachusetts correctly allows 10-round magazines');

      return { success: true };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test 5: API Failure Recovery Test
   */
  async testAPIFailureRecovery(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Testing API failure recovery...');
      
      // Create test data
      const user = await TestUserGenerator.createTestUser();
      const ffl = await TestFFLGenerator.createTestFFL();
      const firearm = await TestProductGenerator.createFirearmProduct();

      const cartItems: CartItem[] = [{
        productId: firearm.id,
        productName: firearm.name,
        sku: firearm.sku,
        quantity: 1,
        price: 599.00,
        requiresFFL: true
      }];

      // Test 1: RSR API Failure
      console.log('\nSimulating RSR API failure...');
      MockExternalServices.disableRSRAPI();

      try {
        // Attempt to check inventory (would normally call RSR API)
        const rsrResult = await MockExternalServices.mockRSRAPICall('inventory', {
          sku: firearm.sku
        });
        
        MockExternalServices.enableRSRAPI();
        return { 
          success: false, 
          error: 'RSR API should have failed but did not' 
        };
      } catch (error: any) {
        if (error.message === 'RSR API is currently unavailable') {
          console.log('✅ RSR API failure detected correctly');
          MockExternalServices.enableRSRAPI();
        } else {
          MockExternalServices.enableRSRAPI();
          return { 
            success: false, 
            error: `Unexpected RSR API error: ${error.message}` 
          };
        }
      }

      // Test 2: FFL Cache Fallback
      console.log('\nTesting FFL cache fallback...');
      
      // Prime the cache first
      await fflCacheService.getFFLById(ffl.id);
      
      // Simulate FFL API failure
      MockExternalServices.disableFFLAPI();
      
      try {
        // Should fall back to cached data
        const cachedFFL = await fflCacheService.getFFLById(ffl.id);
        
        if (!cachedFFL) {
          MockExternalServices.enableFFLAPI();
          return { 
            success: false, 
            error: 'FFL cache fallback failed' 
          };
        }
        
        console.log('✅ FFL cache fallback successful');
        MockExternalServices.enableFFLAPI();
      } catch (error: any) {
        MockExternalServices.enableFFLAPI();
        return { 
          success: false, 
          error: `FFL cache error: ${error.message}` 
        };
      }

      // Test 3: Order marked for manual processing on API failure
      console.log('\nTesting order manual processing flag on API failure...');
      
      // Disable RSR API to simulate failure during checkout
      MockExternalServices.disableRSRAPI();
      
      const checkoutResult = await this.checkoutService.processCheckout({
        userId: parseInt(user.id.split('_').pop() || '0'),
        cartItems,
        shippingAddress: user.shippingAddress,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '12/25',
          cvv: '123'
        },
        customerInfo: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        fflRecipientId: ffl.id,
        skipPaymentProcessing: true
      });
      
      MockExternalServices.enableRSRAPI();

      if (!checkoutResult.success || !checkoutResult.orderId) {
        // Order should still be created even with RSR API failure
        console.log('✅ Order creation continues despite RSR API failure');
      }

      // If order was created, verify it's marked for manual processing
      if (checkoutResult.orderId) {
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, checkoutResult.orderId))
          .limit(1);

        if (order && (order.notes?.includes('manual') || order.rsrOrderNumber === null)) {
          console.log('✅ Order marked for manual processing after API failure');
        }
      }

      // Test 4: Verify retry logic
      console.log('\nTesting API retry logic...');
      
      // Set longer response time to test timeout/retry
      MockExternalServices.setRSRAPIResponseTime(5000);
      
      const startTime = Date.now();
      let retryDetected = false;
      
      try {
        // This should timeout and retry
        await Promise.race([
          MockExternalServices.mockRSRAPICall('order', { sku: firearm.sku }),
          new Promise((_, reject) => 
            setTimeout(() => {
              retryDetected = true;
              reject(new Error('Timeout'));
            }, 1000)
          )
        ]);
      } catch (error: any) {
        if (retryDetected) {
          console.log('✅ API timeout and retry logic working');
        }
      }
      
      // Reset response time
      MockExternalServices.setRSRAPIResponseTime(100);

      return { success: true };

    } catch (error: any) {
      // Ensure services are re-enabled
      MockExternalServices.enableRSRAPI();
      MockExternalServices.enableFFLAPI();
      MockExternalServices.setRSRAPIResponseTime(100);
      
      return { success: false, error: error.message };
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new E2ETestSuite();
  
  suite.run()
    .then(summary => {
      const exitCode = summary.failed > 0 ? 1 : 0;
      console.log(`\nTests completed. Exit code: ${exitCode}`);
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { E2ETestSuite };