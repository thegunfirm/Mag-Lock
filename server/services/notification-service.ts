import { db } from "../db";
import { orders, users, products, ffls } from "@shared/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";

interface NotificationContext {
  orderId: number;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  items: Array<{
    productName: string;
    sku: string;
    quantity: number;
    price: number;
  }>;
  fulfillmentGroups?: any;
  fflInfo?: {
    businessName: string;
    licenseNumber: string;
    address: any;
    phone?: string;
    email?: string;
  };
  trackingInfo?: {
    carrier: string;
    trackingNumber: string;
    estimatedDelivery?: string;
  };
  ihMeta?: any;
  totalValue: number;
  shippingAddress?: any;
}

export class NotificationService {
  private static instance: NotificationService;
  
  private constructor() {}
  
  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Build notification context from order data
   */
  async buildNotificationContext(orderId: number): Promise<NotificationContext | null> {
    try {
      // Fetch order with related data
      const orderData = await db
        .select({
          order: orders,
          user: users,
          ffl: ffls
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(ffls, eq(orders.fflRecipientId, ffls.id))
        .where(eq(orders.id, orderId));

      if (!orderData || orderData.length === 0) {
        console.error(`[Notification Service] Order ${orderId} not found`);
        return null;
      }

      const { order, user, ffl } = orderData[0];
      
      // Parse order items
      const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items as string);
      
      const context: NotificationContext = {
        orderId: order.id,
        orderNumber: `TGF-${order.id.toString().padStart(6, '0')}`,
        customerEmail: user?.email || 'Unknown',
        customerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        items: items.map((item: any) => ({
          productName: item.name || item.productName,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price || item.unitPrice
        })),
        fulfillmentGroups: order.fulfillmentGroups,
        totalValue: parseFloat(order.totalPrice),
        shippingAddress: order.shippingAddress
      };

      // Add FFL info if present
      if (ffl) {
        context.fflInfo = {
          businessName: ffl.businessName,
          licenseNumber: ffl.licenseNumber,
          address: ffl.address,
          phone: ffl.phone,
          email: ffl.contactEmail
        };
      }

      // Add tracking info from ihMeta
      if (order.ihMeta) {
        const meta = typeof order.ihMeta === 'string' ? JSON.parse(order.ihMeta) : order.ihMeta;
        if (meta.outboundTracking || meta.outboundCarrier) {
          context.trackingInfo = {
            carrier: meta.outboundCarrier || 'Unknown',
            trackingNumber: meta.outboundTracking || 'Pending',
            estimatedDelivery: meta.estimatedDelivery
          };
        }
        context.ihMeta = meta;
      }

      // Add RSR tracking if available
      if (order.trackingNumber) {
        if (!context.trackingInfo) {
          context.trackingInfo = {
            carrier: 'RSR',
            trackingNumber: order.trackingNumber
          };
        }
      }

      return context;
    } catch (error) {
      console.error(`[Notification Service] Error building context for order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Send notification for SENT_OUTBOUND status
   */
  async notifySentOutbound(orderId: number, additionalData?: any): Promise<void> {
    const context = await this.buildNotificationContext(orderId);
    if (!context) return;

    const timestamp = new Date().toISOString();
    
    const notification = {
      type: 'IH_STATUS_CHANGE',
      status: 'SENT_OUTBOUND',
      timestamp,
      order: {
        id: context.orderId,
        number: context.orderNumber,
        totalValue: context.totalValue
      },
      customer: {
        email: context.customerEmail,
        name: context.customerName
      },
      shipping: {
        address: context.shippingAddress,
        tracking: context.trackingInfo
      },
      ffl: context.fflInfo ? {
        businessName: context.fflInfo.businessName,
        licenseNumber: context.fflInfo.licenseNumber,
        phone: context.fflInfo.phone,
        email: context.fflInfo.email,
        address: context.fflInfo.address
      } : null,
      items: context.items.map(item => ({
        name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price
      })),
      fulfillmentDetails: {
        groups: context.fulfillmentGroups,
        ihMeta: context.ihMeta,
        ...additionalData
      },
      message: `Order ${context.orderNumber} has been sent outbound to customer`,
      actionRequired: false,
      priority: 'INFO'
    };

    // Log structured notification
    console.log('\n📦 === IH SHIPMENT SENT OUTBOUND ===');
    console.log(JSON.stringify(notification, null, 2));
    console.log('=====================================\n');

    // Store notification for future processing
    await this.storeNotification(notification);
  }

  /**
   * Send notification for ORDER_COMPLETE status
   */
  async notifyOrderComplete(orderId: number, additionalData?: any): Promise<void> {
    const context = await this.buildNotificationContext(orderId);
    if (!context) return;

    const timestamp = new Date().toISOString();
    
    const notification = {
      type: 'IH_STATUS_CHANGE',
      status: 'ORDER_COMPLETE',
      timestamp,
      order: {
        id: context.orderId,
        number: context.orderNumber,
        totalValue: context.totalValue,
        completedAt: timestamp
      },
      customer: {
        email: context.customerEmail,
        name: context.customerName
      },
      delivery: {
        address: context.shippingAddress,
        tracking: context.trackingInfo,
        confirmedDelivery: additionalData?.deliveryConfirmation || false,
        deliveryDate: additionalData?.deliveryDate || timestamp
      },
      ffl: context.fflInfo ? {
        businessName: context.fflInfo.businessName,
        licenseNumber: context.fflInfo.licenseNumber,
        transferComplete: true
      } : null,
      items: context.items,
      fulfillmentSummary: {
        groups: context.fulfillmentGroups,
        ihMeta: context.ihMeta,
        processingTime: additionalData?.processingTime,
        ...additionalData
      },
      message: `Order ${context.orderNumber} has been successfully completed and delivered`,
      actionRequired: false,
      priority: 'SUCCESS'
    };

    // Log structured notification
    console.log('\n✅ === IH ORDER COMPLETED ===');
    console.log(JSON.stringify(notification, null, 2));
    console.log('==============================\n');

    // Store notification for future processing
    await this.storeNotification(notification);
  }

  /**
   * Send notification for RECEIVED_FROM_RSR status
   */
  async notifyReceivedFromRSR(orderId: number, additionalData?: any): Promise<void> {
    const context = await this.buildNotificationContext(orderId);
    if (!context) return;

    const timestamp = new Date().toISOString();
    
    const notification = {
      type: 'IH_STATUS_CHANGE',
      status: 'RECEIVED_FROM_RSR',
      timestamp,
      order: {
        id: context.orderId,
        number: context.orderNumber,
        totalValue: context.totalValue
      },
      customer: {
        email: context.customerEmail,
        name: context.customerName
      },
      items: context.items,
      rsrInfo: {
        rsrOrderNumber: additionalData?.rsrOrderNumber,
        receivedDate: timestamp,
        ...additionalData?.rsrDetails
      },
      nextSteps: 'Order will be processed and sent to customer/FFL',
      estimatedProcessingTime: '1-2 business days',
      message: `Order ${context.orderNumber} received from RSR, ready for processing`,
      actionRequired: true,
      actionDescription: 'Process and ship to customer/FFL',
      priority: 'MEDIUM'
    };

    // Log structured notification
    console.log('\n📥 === IH RECEIVED FROM RSR ===');
    console.log(JSON.stringify(notification, null, 2));
    console.log('================================\n');

    // Store notification for future processing
    await this.storeNotification(notification);
  }

  /**
   * Send generic IH status change notification
   */
  async notifyStatusChange(orderId: number, oldStatus: string | null, newStatus: string, additionalData?: any): Promise<void> {
    const context = await this.buildNotificationContext(orderId);
    if (!context) return;

    const timestamp = new Date().toISOString();
    
    const notification = {
      type: 'IH_STATUS_CHANGE',
      timestamp,
      statusChange: {
        from: oldStatus || 'None',
        to: newStatus
      },
      order: {
        id: context.orderId,
        number: context.orderNumber,
        totalValue: context.totalValue
      },
      customer: {
        email: context.customerEmail,
        name: context.customerName
      },
      items: context.items,
      ffl: context.fflInfo,
      additionalData,
      message: `Order ${context.orderNumber} status changed from ${oldStatus || 'None'} to ${newStatus}`,
      priority: 'INFO'
    };

    // Log structured notification
    console.log('\n🔄 === IH STATUS CHANGE ===');
    console.log(JSON.stringify(notification, null, 2));
    console.log('============================\n');

    // Store notification for future processing
    await this.storeNotification(notification);
  }

  /**
   * Store notification for future processing/integration
   * This could be extended to save to database or send to external service
   */
  private async storeNotification(notification: any): Promise<void> {
    // For now, just log to structured monitoring output
    // This can be picked up by log aggregation services
    console.log(JSON.stringify({
      log_type: 'NOTIFICATION',
      service: 'ih_notifications',
      ...notification
    }));

    // TODO: Future implementation could:
    // - Save to notifications table
    // - Send to webhook
    // - Queue for email service
    // - Push to monitoring dashboard
  }

  /**
   * Send batch notifications for multiple orders
   */
  async sendBatchNotifications(orderIds: number[], status: string): Promise<void> {
    console.log(`[Notification Service] Sending batch notifications for ${orderIds.length} orders`);
    
    for (const orderId of orderIds) {
      try {
        switch (status) {
          case 'SENT_OUTBOUND':
            await this.notifySentOutbound(orderId);
            break;
          case 'ORDER_COMPLETE':
            await this.notifyOrderComplete(orderId);
            break;
          case 'RECEIVED_FROM_RSR':
            await this.notifyReceivedFromRSR(orderId);
            break;
          default:
            await this.notifyStatusChange(orderId, null, status);
        }
      } catch (error) {
        console.error(`[Notification Service] Error sending notification for order ${orderId}:`, error);
      }
    }
  }

  /**
   * Send alert for stuck shipments
   */
  async sendStuckShipmentAlert(stuckShipments: any[]): Promise<void> {
    const timestamp = new Date().toISOString();
    
    const alert = {
      type: 'IH_STUCK_SHIPMENT_ALERT',
      timestamp,
      severity: 'WARNING',
      summary: `${stuckShipments.length} IH shipments are stuck in RECEIVED_FROM_RSR status`,
      shipments: stuckShipments.map(s => ({
        orderId: s.orderId,
        orderNumber: s.orderNumber,
        daysSinceReceived: s.daysSinceReceived,
        customerEmail: s.customerEmail,
        totalValue: s.totalValue,
        itemCount: s.items.length
      })),
      totalValueAtRisk: stuckShipments.reduce((sum, s) => sum + s.totalValue, 0),
      actionRequired: 'Review and process stuck shipments immediately',
      priority: 'HIGH'
    };

    // Log alert
    console.log('\n🚨 === STUCK SHIPMENT ALERT ===');
    console.log(JSON.stringify(alert, null, 2));
    console.log('================================\n');

    // Store alert
    await this.storeNotification(alert);
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();