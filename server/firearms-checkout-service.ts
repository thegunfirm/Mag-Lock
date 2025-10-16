import { db } from './db';
import { orders, orderLines, products, ffls } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { firearmsComplianceService, type ComplianceCheckResult, type CartItem } from './firearms-compliance-service';
import { authorizeNetService } from './authorize-net-service';
import { rsrEngineClient } from './services/rsr-engine-client';
import { orderZohoIntegration, OrderZohoIntegration } from './order-zoho-integration';
import { determineFulfillmentSource } from './config/ih-sku-allowlist';
import type { InsertOrder, InsertOrderLine } from '@shared/schema';
import { checkCartStateCompliance, logComplianceBlock } from './state-compliance-rules';
import { fflCacheService } from './services/ffl-cache-service';

export interface CheckoutPayload {
  userId: number;
  cartItems: CartItem[];
  shippingAddress: any;
  paymentMethod: {
    cardNumber: string;
    expirationDate: string;
    cvv: string;
  };
  customerInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  fflRecipientId?: number;
  skipPaymentProcessing?: boolean; // For testing
}

export interface CheckoutResult {
  success: boolean;
  orderId?: number;
  orderNumber?: string;
  status: 'Paid' | 'Pending FFL' | 'Hold – Multi-Firearm';
  hold?: {
    type: 'FFL' | 'Multi-Firearm';
    reason: string;
  };
  authTransactionId?: string;
  transactionId?: string;
  error?: string;
  dealId?: string;
}

export class FirearmsCheckoutService {
  
  /**
   * Process comprehensive checkout with firearms compliance
   */
  async processCheckout(payload: CheckoutPayload): Promise<CheckoutResult> {
    try {
      console.log('🔧 Starting checkout process...');
      
      // Step 0: Check state compliance first (before any other checks)
      console.log('Step 0: Checking state compliance...');
      if (payload.shippingAddress && payload.shippingAddress.state) {
        const stateComplianceResult = await checkCartStateCompliance(
          payload.cartItems,
          payload.shippingAddress.state
        );
        
        if (!stateComplianceResult.isAllowed) {
          // Log compliance block for audit trail
          await logComplianceBlock(
            payload.userId,
            payload.shippingAddress.state,
            stateComplianceResult.blockedItems,
            'checkout'
          );
          
          // Return error with detailed information
          console.error('❌ State compliance block at checkout:', stateComplianceResult);
          return {
            success: false,
            status: 'Paid',
            error: stateComplianceResult.message || `Cannot ship to ${payload.shippingAddress.state} due to state regulations`
          };
        }
        
        // Log warnings if any
        if (stateComplianceResult.warnings.length > 0) {
          console.warn('⚠️ State compliance warnings:', stateComplianceResult.warnings);
        }
      }
      console.log('✅ State compliance check passed');
      
      // Step 1: Perform firearms compliance check
      console.log('Step 1: Checking firearms compliance...');
      const complianceResult = await firearmsComplianceService.performComplianceCheck(
        payload.userId,
        payload.cartItems
      );
      console.log('✅ Firearms compliance check completed:', complianceResult);

      // Step 2: Calculate total amount
      console.log('Step 2: Calculating total amount...');
      const totalAmount = payload.cartItems.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );
      console.log('✅ Total amount calculated:', totalAmount);

      // Step 3: Handle payment based on compliance result
      let authResult;
      let orderStatus: string;
      let holdInfo = null;

      if (complianceResult.requiresHold) {
        // NEW POLICY: Charge card immediately for firearms but hold RSR processing
        console.log('Step 3a: Processing payment with hold...');
        
        if (payload.skipPaymentProcessing) {
          console.log('⚠️  SKIPPING payment processing for test...');
          authResult = {
            success: true,
            transactionId: 'TEST_SKIP_' + Date.now(),
            authCode: 'TEST123'
          };
          console.log('✅ Mock payment result created:', authResult);
        } else {
          authResult = await authorizeNetService.authCaptureTransaction(
            totalAmount,
            payload.paymentMethod.cardNumber,
            payload.paymentMethod.expirationDate,
            payload.paymentMethod.cvv,
            {
              ...payload.customerInfo,
              address: payload.shippingAddress,
            }
          );
        }

        if (!authResult.success) {
          return {
            success: false,
            status: 'Paid',
            error: `Payment processing failed: ${authResult.error}`,
          };
        }

        orderStatus = firearmsComplianceService.getOrderStatusForHold(complianceResult.holdType);
        holdInfo = {
          type: complianceResult.holdType!,
          reason: complianceResult.reason || 'Payment completed - awaiting FFL verification for processing',
        };
      } else {
        // Normal checkout - capture immediately
        console.log('Step 3b: Processing normal payment...');
        
        if (payload.skipPaymentProcessing) {
          console.log('⚠️  SKIPPING payment processing for test...');
          authResult = {
            success: true,
            transactionId: 'TEST_SKIP_' + Date.now(),
            authCode: 'TEST123'
          };
        } else {
          console.log('About to call Authorize.Net SANDBOX with amount:', totalAmount);
          
          try {
            authResult = await Promise.race([
              authorizeNetService.authCaptureTransaction(
                totalAmount,
                payload.paymentMethod.cardNumber,
                payload.paymentMethod.expirationDate,
                payload.paymentMethod.cvv,
                {
                  ...payload.customerInfo,
                  address: payload.shippingAddress,
                }
              ),
              new Promise<AuthResult>((_, reject) => 
                setTimeout(() => reject(new Error('Payment processing timeout')), 15000)
              )
            ]);
          } catch (error: any) {
            console.error('Payment processing error:', error);
            authResult = {
              success: false,
              error: error.message || 'Payment processing failed'
            };
          }
        }
        
        console.log('✅ Payment processing result:', authResult);

        if (!authResult.success) {
          return {
            success: false,
            status: 'Paid',
            error: `Payment failed: ${authResult.error}`,
          };
        }

        orderStatus = 'Paid';
      }

      // Step 4: Create order record
      console.log('Step 4: Creating order record...');
      const orderNumber = this.generateOrderNumber();
      console.log('Generated order number:', orderNumber);
      
      // Step 4a: Fetch and persist FFL data if FFL is selected (with fallback)
      let persistedFflData = null;
      if (payload.fflRecipientId) {
        console.log('Fetching FFL data for persistence...');
        
        // Use FFL cache service with fallback
        const fflResult = await fflCacheService.getFFL(payload.fflRecipientId, {
          allowStale: true // Allow stale data in checkout to prevent failures
        });
        
        if (fflResult.ffl) {
          const ffl = fflResult.ffl;
          
          // Log if using stale data
          if (fflResult.isStale) {
            console.warn(`⚠️ Using stale FFL data for ID ${payload.fflRecipientId}: ${fflResult.warning}`);
          }
          
          // Create persistedFfl object with all necessary FFL info
          persistedFflData = {
            id: ffl.id,
            name: ffl.businessName,
            atfNumber: ffl.licenseNumber,
            street: typeof ffl.address === 'string' ? JSON.parse(ffl.address).street : ffl.address.street,
            city: typeof ffl.address === 'string' ? JSON.parse(ffl.address).city : ffl.address.city,
            state: typeof ffl.address === 'string' ? JSON.parse(ffl.address).state : ffl.address.state,
            zip: ffl.zip,
            phone: ffl.phone || null,
            email: ffl.contactEmail || null,
            isStaleData: fflResult.isStale || false // Track if data was stale
          };
          console.log('✅ FFL data prepared for persistence:', persistedFflData);
        } else {
          // FFL not found even in cache - this is a critical error
          console.error(`❌ FFL ${payload.fflRecipientId} not found in database or cache`);
          // Continue with checkout but mark for manual review
          persistedFflData = {
            id: payload.fflRecipientId,
            error: 'FFL data unavailable - requires manual verification'
          };
        }
      }
      
      // Step 4b: Determine fulfillment groups and types based on product flags and SKU allowlist
      const fulfillmentGroups = [];
      
      // Group items by fulfillment source
      const ihFirearmItems: typeof payload.cartItems = [];
      const rsrFirearmItems: typeof payload.cartItems = [];
      const directCustomerItems: typeof payload.cartItems = [];
      
      // Process each item through the new routing logic
      for (const item of payload.cartItems) {
        // Determine fulfillment source using product flags and SKU allowlist
        const fulfillmentSource = determineFulfillmentSource({
          fulfillmentSource: item.fulfillmentSource,
          sku: item.sku || item.productSku,
          rsrStockNumber: item.rsrStockNumber,
          isFirearm: item.isFirearm,
          requiresFFL: item.requiresFFL
        });
        
        // Route based on fulfillment source and firearm status
        if ((item.isFirearm || item.requiresFFL)) {
          if (fulfillmentSource === 'ih') {
            ihFirearmItems.push(item);
          } else {
            // Default to RSR for firearms if not explicitly in-house
            rsrFirearmItems.push(item);
          }
        } else {
          // Non-firearms go direct to customer
          directCustomerItems.push(item);
        }
      }
      
      // Add in-house firearm group if applicable
      if (ihFirearmItems.length > 0) {
        fulfillmentGroups.push({
          groupId: 'IH-FFL-001',
          fulfillmentType: 'ih_ffl', // In-house to FFL
          items: ihFirearmItems.map(item => ({
            productId: item.productId,
            sku: item.sku || item.productSku,
            quantity: item.quantity
          })),
          fflRequired: true,
          fflId: payload.fflRecipientId
        });
      }
      
      // Add RSR drop-ship firearm group if applicable
      if (rsrFirearmItems.length > 0) {
        fulfillmentGroups.push({
          groupId: 'DS-FFL-001',
          fulfillmentType: 'ds_ffl', // Drop-ship from RSR to FFL
          items: rsrFirearmItems.map(item => ({
            productId: item.productId,
            sku: item.sku || item.productSku,
            quantity: item.quantity
          })),
          fflRequired: true,
          fflId: payload.fflRecipientId
        });
      }
      
      // Add direct to customer group if applicable
      if (directCustomerItems.length > 0) {
        fulfillmentGroups.push({
          groupId: 'DIRECT-001',
          fulfillmentType: 'ds_customer', // Drop-ship to customer
          items: directCustomerItems.map(item => ({
            productId: item.productId,
            sku: item.sku || item.productSku,
            quantity: item.quantity
          })),
          fflRequired: false
        });
      }
      
      const orderData: InsertOrder = {
        userId: payload.userId,
        totalPrice: totalAmount.toString(),
        status: orderStatus,
        items: payload.cartItems,
        fflRecipientId: payload.fflRecipientId,
        persistedFfl: persistedFflData, // Persist FFL data for IH order management
        fulfillmentGroups: fulfillmentGroups, // Track fulfillment types for IH orders
        shippingAddress: payload.shippingAddress,
        authorizeNetTransactionId: authResult.transactionId,
        // Firearms compliance fields
        holdReason: complianceResult.holdType,
        authTransactionId: null, // No longer using auth-only transactions
        authExpiresAt: null, // No expiration since payment is captured
        capturedAt: new Date(), // Always captured immediately now
        fflRequired: complianceResult.hasFirearms,
        fflStatus: complianceResult.hasFirearms ? 'Missing' : null,
        firearmsWindowCount: complianceResult.pastFirearmsCount,
        windowDays: complianceResult.windowDays,
        limitQty: complianceResult.limitQuantity,
      };

      console.log('About to insert order to database...');
      const [newOrder] = await db.insert(orders).values(orderData).returning();
      console.log('✅ Order created in database:', newOrder.id);

      // Step 5: Create order line items
      const orderLineData: InsertOrderLine[] = payload.cartItems.map(item => ({
        orderId: newOrder.id,
        productId: item.productId, // Use productId (integer) not id (string)
        quantity: item.quantity,
        unitPrice: item.price.toString(),
        totalPrice: (item.price * item.quantity).toString(),
        isFirearm: item.isFirearm || item.requiresFFL,
      }));

      console.log('About to insert order lines...');
      console.log('Cart items being processed:', JSON.stringify(payload.cartItems, null, 2));
      console.log('Order line data:', JSON.stringify(orderLineData, null, 2));
      await db.insert(orderLines).values(orderLineData);
      console.log('✅ Order lines created');

      // Step 6: Submit order to RSR for fulfillment (with resilience)
      // IMPORTANT: Payment has already been captured - RSR submission failure should not block order
      let rsrSubmissionStatus = 'pending';
      let rsrSubmissionError = null;
      
      if (!complianceResult.requiresHold && !payload.skipRSROrdering) {
        try {
          console.log(`📦 Submitting order ${orderNumber} to RSR for fulfillment...`);
          
          const rsrOrderResult = await this.submitOrderToRSR(newOrder, payload);
          
          if (rsrOrderResult.success) {
            console.log(`✅ RSR order submitted successfully: ${rsrOrderResult.rsrOrderNumber}`);
            rsrSubmissionStatus = 'success';
            
            // Update order with RSR order number
            await db.update(orders)
              .set({
                rsrOrderNumber: rsrOrderResult.rsrOrderNumber,
                status: 'Processing',
                estimatedShipDate: rsrOrderResult.estimatedShipDate?.toISOString()
              })
              .where(eq(orders.id, newOrder.id));
          } else {
            console.error(`⚠️ RSR order submission failed: ${rsrOrderResult.error}`);
            rsrSubmissionStatus = 'failed';
            rsrSubmissionError = rsrOrderResult.error;
            
            // PARTIAL FAILURE HANDLING: Payment succeeded but RSR failed
            // Mark for manual processing - DO NOT fail the entire order
            await db.update(orders)
              .set({ 
                status: 'Manual Processing Required',
                notes: `Payment captured successfully. RSR submission failed and requires manual processing: ${rsrOrderResult.error}`,
                manualProcessingReason: 'rsr_submission_failed',
                paymentCaptured: true,
                rsrSubmissionAttempted: new Date(),
                rsrSubmissionError: rsrOrderResult.error
              })
              .where(eq(orders.id, newOrder.id));
              
            // Log for monitoring
            console.warn(`⚠️ PARTIAL FAILURE: Order ${orderNumber} paid but RSR submission failed. Marked for manual processing.`);
            
            // Create audit log entry for partial failure
            await db.execute(sql`
              INSERT INTO audit_logs (event_type, order_id, details, created_at)
              VALUES ('partial_failure', ${newOrder.id}, ${JSON.stringify({
                orderNumber,
                paymentStatus: 'captured',
                paymentTransactionId: authResult.transactionId,
                rsrError: rsrOrderResult.error,
                action: 'marked_for_manual_processing'
              })}, NOW())
            `).catch(err => console.error('Failed to log partial failure:', err));
          }
        } catch (rsrError: any) {
          // Critical error during RSR submission - still don't block the order
          console.error('❌ RSR order submission critical error (non-blocking):', rsrError);
          rsrSubmissionStatus = 'error';
          rsrSubmissionError = rsrError.message || 'Unknown error';
          
          // Mark for manual processing with critical error flag
          await db.update(orders)
            .set({ 
              status: 'Manual Processing Required - Critical',
              notes: `Payment captured. Critical RSR submission error: ${rsrError.message}`,
              manualProcessingReason: 'rsr_critical_error',
              paymentCaptured: true,
              rsrSubmissionAttempted: new Date(),
              rsrSubmissionError: rsrError.message
            })
            .where(eq(orders.id, newOrder.id));
            
          console.error(`❌ CRITICAL PARTIAL FAILURE: Order ${orderNumber} requires immediate attention`);
        }
      } else if (payload.skipRSROrdering) {
        console.log(`🧪 RSR ordering skipped for testing - order ${orderNumber} marked as ready for manual processing`);
        rsrSubmissionStatus = 'skipped';
        await db.update(orders)
          .set({ 
            status: 'Ready for Fulfillment (Test Mode)',
            notes: 'RSR ordering skipped for testing'
          })
          .where(eq(orders.id, newOrder.id));
      }

      // Step 7: Sync to Zoho CRM
      let dealId: string | undefined;
      try {
        const customerInfo = {
          email: payload.customerInfo.email,
          name: `${payload.customerInfo.firstName} ${payload.customerInfo.lastName}`,
          membershipTier: 'Bronze', // TODO: Get from user session
          zohoContactId: undefined
        };

        const zohoOrderData = OrderZohoIntegration.formatOrderForZoho(
          {
            ...newOrder,
            orderNumber,
            items: payload.cartItems.map(item => ({
              productName: item.name,
              sku: item.sku || '',
              quantity: item.quantity,
              unitPrice: item.price,
              totalPrice: item.price * item.quantity,
              fflRequired: item.requiresFFL || item.isFirearm
            })),
            fflDealerName: undefined // Will be updated when FFL is attached
          },
          customerInfo
        );

        // Add RSR-specific data for comprehensive field mapping
        zohoOrderData.fulfillmentType = this.requiresDropShip(payload.cartItems) ? 'Drop-Ship' : 'In-House';
        zohoOrderData.orderingAccount = this.requiresDropShip(payload.cartItems) ? '99902' : '99901'; // Test accounts
        zohoOrderData.requiresDropShip = this.requiresDropShip(payload.cartItems);
        zohoOrderData.holdType = complianceResult.requiresHold ? 
          (payload.fflRecipientId ? 'Gun Count Rule' : 'FFL not on file') : 
          undefined;
        zohoOrderData.engineResponse = null; // No RSR engine call for basic system fields
        zohoOrderData.isTestOrder = true; // Set to false for production
        
        // Keep original order items (no RSR stock numbers needed for system fields)
        // RSR stock numbers will be added when RSR engine processes the order later

        console.log(`🔄 Syncing firearms compliance order ${orderNumber} to Zoho CRM with automatic system field population...`);
        const zohoResult = await orderZohoIntegration.processOrderWithSystemFields(zohoOrderData);
        
        if (zohoResult.success) {
          dealId = zohoResult.dealId;
          
          // Update order with Zoho IDs
          await db.update(orders)
            .set({
              zohoDealId: zohoResult.dealId,
              zohoContactId: zohoResult.contactId,
            })
            .where(eq(orders.id, newOrder.id));
            
          console.log(`✅ Firearms order ${orderNumber} linked to Zoho Deal ${zohoResult.dealId} with TGF Order Number ${zohoResult.tgfOrderNumber}`);
        } else {
          console.error(`⚠️  Failed to create Zoho deal for firearms order ${orderNumber}: ${zohoResult.error}`);
        }
      } catch (zohoError) {
        console.error('Zoho sync failed (non-blocking):', zohoError);
      }

      // Step 7: Return success result
      return {
        success: true,
        orderId: newOrder.id,
        orderNumber,
        status: orderStatus as any,
        hold: holdInfo || undefined,
        authTransactionId: undefined, // No longer using auth-only
        transactionId: authResult.transactionId, // Always return captured transaction ID
        dealId,
      };

    } catch (error: any) {
      console.error('Checkout processing error:', error);
      return {
        success: false,
        status: 'Paid',
        error: `Checkout failed: ${error.message}`,
      };
    }
  }

  /**
   * Process FFL attachment and verification
   */
  async attachAndVerifyFFL(
    orderId: number,
    fflDealerId: string,
    verifyFFL: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.status !== 'Pending FFL') {
        return { success: false, error: 'Order is not in Pending FFL status' };
      }

      // Update FFL info
      const updateData: Partial<typeof orders.$inferSelect> = {
        fflDealerId,
        fflStatus: verifyFFL ? 'Verified' : 'Pending Verification',
        fflVerifiedAt: verifyFFL ? new Date() : null,
      };

      // If verifying and there's an auth transaction, capture it
      let captureResult = null;
      if (verifyFFL && order.authTransactionId) {
        captureResult = await authorizeNetService.capturePriorAuthTransaction(
          order.authTransactionId,
          parseFloat(order.totalPrice)
        );

        if (captureResult.success) {
          updateData.status = 'Ready to Fulfill';
          updateData.capturedAt = new Date();
        } else {
          return { success: false, error: `Payment capture failed: ${captureResult.error}` };
        }
      }

      // Update order
      await db.update(orders).set(updateData).where(eq(orders.id, orderId));

      // Sync to Zoho if deal exists
      if (order.zohoDealId) {
        try {
          // Use the OrderZohoIntegration to update deal stage
          const dealStage = firearmsComplianceService.mapOrderStatusToDealStage(updateData.status || order.status);
          await orderZohoIntegration.updateRSROrderFields(order.zohoDealId, { Order_Status: updateData.status || order.status });
          console.log(`✅ Updated Zoho deal ${order.zohoDealId} status to: ${dealStage}`);
        } catch (zohoError) {
          console.error('Zoho sync failed (non-blocking):', zohoError);
        }
      }

      return { success: true };

    } catch (error: any) {
      console.error('FFL verification error:', error);
      return { success: false, error: `FFL verification failed: ${error.message}` };
    }
  }

  /**
   * Override hold (admin only)
   */
  async overrideHold(
    orderId: number,
    reason: string,
    adminUserId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (!['Pending FFL', 'Hold – Multi-Firearm'].includes(order.status)) {
        return { success: false, error: 'Order is not in a hold status' };
      }

      let captureResult = null;
      
      // If there's an auth transaction, capture it
      if (order.authTransactionId) {
        captureResult = await authorizeNetService.capturePriorAuthTransaction(
          order.authTransactionId,
          parseFloat(order.totalPrice)
        );

        if (!captureResult.success) {
          return { success: false, error: `Payment capture failed: ${captureResult.error}` };
        }
      }

      // Update order status
      await db.update(orders).set({
        status: 'Ready to Fulfill',
        holdReason: null,
        capturedAt: new Date(),
      }).where(eq(orders.id, orderId));

      // TODO: Add audit log entry
      console.log(`Admin override: Order ${orderId} hold removed by user ${adminUserId}. Reason: ${reason}`);

      // Sync to Zoho
      if (order.zohoDealId) {
        try {
          await orderZohoIntegration.updateRSROrderFields(order.zohoDealId, { Order_Status: 'Ready to Fulfill' });
        } catch (zohoError) {
          console.error('Zoho sync failed (non-blocking):', zohoError);
        }
      }

      return { success: true };

    } catch (error: any) {
      console.error('Hold override error:', error);
      return { success: false, error: `Hold override failed: ${error.message}` };
    }
  }

  /**
   * Submit order to RSR for fulfillment
   */
  private async submitOrderToRSR(order: any, payload: CheckoutPayload): Promise<{
    success: boolean;
    rsrOrderNumber?: string;
    estimatedShipDate?: Date;
    error?: string;
  }> {
    try {
      // Map cart items to RSR order items
      const rsrItems = await this.mapCartItemsToRSR(payload.cartItems);
      
      if (rsrItems.length === 0) {
        return {
          success: false,
          error: 'No RSR items found in cart'
        };
      }

      // Get FFL information if required
      let fflLicense: string | undefined;
      if (payload.fflRecipientId) {
        // TODO: Get FFL license number from database
        const fflInfo = await this.getFFL(payload.fflRecipientId);
        fflLicense = fflInfo?.licenseNumber;
      }

      // Build Engine order payload
      const enginePayload = rsrEngineClient.buildOrderPayload({
        orderNumber: order.orderNumber,
        shippingAddress: payload.shippingAddress,
        customerInfo: payload.customerInfo,
        items: rsrItems,
        fflLicense,
        dropShip: this.requiresDropShip(payload.cartItems)
      });

      // Submit to RSR Engine
      return await rsrEngineClient.submitOrder(enginePayload);

    } catch (error: any) {
      console.error('RSR order mapping error:', error);
      return {
        success: false,
        error: `RSR submission failed: ${error.message}`
      };
    }
  }

  /**
   * Map cart items to RSR order items
   */
  private async mapCartItemsToRSR(cartItems: CartItem[]): Promise<Array<{
    rsrStockNumber: string;
    quantity: number;
    customerPrice: number;
    unitPrice: number;
  }>> {
    const rsrItems = [];

    for (const item of cartItems) {
      // Get product details to find RSR stock number
      const [product] = await db.select()
        .from(products)
        .where(eq(products.id, item.id));

      if (product && product.rsrStockNumber) {
        rsrItems.push({
          rsrStockNumber: product.rsrStockNumber,
          quantity: item.quantity,
          customerPrice: item.price,
          unitPrice: parseFloat(product.rsrPrice || product.price || '0')
        });
      }
    }

    return rsrItems;
  }

  /**
   * Get FFL information
   */
  private async getFFL(fflId: number): Promise<{ licenseNumber: string } | null> {
    // TODO: Implement FFL lookup from database
    // For now, return null until FFL table is properly integrated
    return null;
  }

  /**
   * Check if order requires drop shipping
   */
  private requiresDropShip(cartItems: CartItem[]): boolean {
    return cartItems.some(item => 
      item.requiresFFL && 
      this.isDropShipEligible(item.manufacturer || '')
    );
  }

  /**
   * Check if manufacturer is eligible for drop shipping
   */
  private isDropShipEligible(manufacturer: string): boolean {
    const dropShipBrands = ['GLOCK', 'SMITH & WESSON', 'SIG SAUER', 'S&W', 'SIG'];
    const mfg = manufacturer.toUpperCase();
    return dropShipBrands.some(brand => mfg.includes(brand));
  }

  /**
   * Generate unique order number
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${timestamp}-${random}`;
  }
}

// Export singleton instance
export const firearmsCheckoutService = new FirearmsCheckoutService();