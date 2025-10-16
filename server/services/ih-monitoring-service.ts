import { db } from "../db";
import { orders, users, products, ffls } from "@shared/schema";
import { eq, and, lt, isNull, isNotNull, sql } from "drizzle-orm";
import { format } from "date-fns";

interface StuckShipment {
  orderId: number;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  ihStatus: string;
  createdAt: Date;
  daysSinceReceived: number;
  totalValue: number;
  items: Array<{
    productName: string;
    sku: string;
    quantity: number;
  }>;
  fflInfo?: {
    businessName: string;
    licenseNumber: string;
    address: any;
  };
  ihMeta?: any;
}

export class IHMonitoringService {
  private static instance: IHMonitoringService;
  
  private constructor() {}
  
  static getInstance(): IHMonitoringService {
    if (!IHMonitoringService.instance) {
      IHMonitoringService.instance = new IHMonitoringService();
    }
    return IHMonitoringService.instance;
  }

  /**
   * Check for stuck IH shipments (orders with RECEIVED_FROM_RSR status older than specified days)
   */
  async checkStuckShipments(daysThreshold: number = 3): Promise<StuckShipment[]> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

      // Query for stuck IH shipments - select only needed columns
      const stuckOrders = await db
        .select({
          orderId: orders.id,
          ihStatus: orders.ihStatus,
          ihMeta: orders.ihMeta,
          createdAt: orders.createdAt,
          totalPrice: orders.totalPrice,
          items: orders.items,
          rsrOrderNumber: orders.rsrOrderNumber,
          trackingNumber: orders.trackingNumber,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          fflBusinessName: ffls.businessName,
          fflLicenseNumber: ffls.licenseNumber,
          fflAddress: ffls.address,
          fflPhone: ffls.phone,
          fflEmail: ffls.contactEmail
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(ffls, eq(orders.fflRecipientId, ffls.id))
        .where(
          and(
            eq(orders.ihStatus, 'RECEIVED_FROM_RSR'),
            lt(orders.createdAt, thresholdDate)
          )
        );

      const stuckShipments: StuckShipment[] = [];

      for (const row of stuckOrders) {
        // Calculate days since received
        const daysSinceReceived = Math.floor(
          (new Date().getTime() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Parse order items
        const items = Array.isArray(row.items) ? row.items : JSON.parse(row.items as string);
        
        const shipmentData: StuckShipment = {
          orderId: row.orderId,
          orderNumber: `TGF-${row.orderId.toString().padStart(6, '0')}`,
          customerEmail: row.userEmail || 'Unknown',
          customerName: row.userFirstName && row.userLastName ? 
            `${row.userFirstName} ${row.userLastName}` : 'Unknown',
          ihStatus: row.ihStatus || 'RECEIVED_FROM_RSR',
          createdAt: row.createdAt,
          daysSinceReceived,
          totalValue: parseFloat(row.totalPrice),
          items: items.map((item: any) => ({
            productName: item.name || item.productName,
            sku: item.sku,
            quantity: item.quantity
          })),
          ihMeta: row.ihMeta
        };

        // Add FFL info if present
        if (row.fflBusinessName) {
          shipmentData.fflInfo = {
            businessName: row.fflBusinessName,
            licenseNumber: row.fflLicenseNumber,
            address: row.fflAddress
          };
        }

        stuckShipments.push(shipmentData);
      }

      return stuckShipments;
    } catch (error) {
      console.error('[IH Monitoring] Error checking stuck shipments:', error);
      throw error;
    }
  }

  /**
   * Generate admin alert for stuck shipments
   */
  generateAdminAlert(stuckShipments: StuckShipment[]): void {
    if (stuckShipments.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    
    console.log('\n========================================');
    console.log('🚨 IH SHIPMENT MONITORING ALERT 🚨');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Found ${stuckShipments.length} stuck IH shipments`);
    console.log('========================================\n');

    stuckShipments.forEach((shipment, index) => {
      console.log(`--- Stuck Shipment #${index + 1} ---`);
      console.log(JSON.stringify({
        alert_type: 'STUCK_IH_SHIPMENT',
        timestamp,
        order_id: shipment.orderId,
        order_number: shipment.orderNumber,
        days_stuck: shipment.daysSinceReceived,
        customer_email: shipment.customerEmail,
        customer_name: shipment.customerName,
        total_value: shipment.totalValue,
        ih_status: shipment.ihStatus,
        received_date: shipment.createdAt,
        items_count: shipment.items.length,
        items: shipment.items,
        ffl_business: shipment.fflInfo?.businessName || 'N/A',
        ffl_license: shipment.fflInfo?.licenseNumber || 'N/A',
        ih_meta: shipment.ihMeta,
        action_required: 'Review and process shipment',
        priority: shipment.daysSinceReceived > 5 ? 'HIGH' : 'MEDIUM'
      }, null, 2));
      console.log('');
    });

    console.log('========================================');
    console.log(`🔔 Summary: ${stuckShipments.length} orders need immediate attention`);
    console.log(`📊 Total value at risk: $${stuckShipments.reduce((sum, s) => sum + s.totalValue, 0).toFixed(2)}`);
    console.log('========================================\n');
  }

  /**
   * Run hourly monitoring check
   */
  async runMonitoringCheck(): Promise<void> {
    console.log(`[IH Monitoring] Starting monitoring check at ${new Date().toISOString()}`);
    
    try {
      const stuckShipments = await this.checkStuckShipments(3);
      
      if (stuckShipments.length > 0) {
        console.log(`[IH Monitoring] Found ${stuckShipments.length} stuck shipments`);
        this.generateAdminAlert(stuckShipments);
        
        // Log to structured monitoring data for future integration
        await this.logMonitoringResult({
          timestamp: new Date(),
          stuckCount: stuckShipments.length,
          totalValue: stuckShipments.reduce((sum, s) => sum + s.totalValue, 0),
          orderIds: stuckShipments.map(s => s.orderId),
          oldestDaysStuck: Math.max(...stuckShipments.map(s => s.daysSinceReceived))
        });
      } else {
        console.log('[IH Monitoring] No stuck shipments found');
      }
    } catch (error) {
      console.error('[IH Monitoring] Error during monitoring check:', error);
      // Log error for monitoring
      await this.logMonitoringResult({
        timestamp: new Date(),
        error: error.message,
        stuckCount: -1
      });
    }
  }

  /**
   * Log monitoring results for analytics
   */
  private async logMonitoringResult(result: any): Promise<void> {
    // For now, just log to console in structured format
    // This could be saved to database or sent to monitoring service
    console.log(JSON.stringify({
      type: 'IH_MONITORING_RESULT',
      ...result
    }));
  }

  /**
   * Get monitoring statistics
   */
  async getMonitoringStats(): Promise<any> {
    try {
      // Count orders by IH status
      const statusCounts = await db
        .select({
          status: orders.ihStatus,
          count: sql<number>`count(*)::int`
        })
        .from(orders)
        .where(isNotNull(orders.ihStatus))
        .groupBy(orders.ihStatus);

      // Get average processing time for completed IH orders
      const avgProcessingTime = await db
        .select({
          avgDays: sql<number>`avg(EXTRACT(EPOCH FROM (${orders.updatedAt} - ${orders.createdAt})) / 86400)::float`
        })
        .from(orders)
        .where(eq(orders.ihStatus, 'ORDER_COMPLETE'));

      return {
        statusDistribution: statusCounts,
        averageProcessingDays: avgProcessingTime[0]?.avgDays || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[IH Monitoring] Error getting stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const ihMonitoringService = IHMonitoringService.getInstance();