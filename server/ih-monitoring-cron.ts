/**
 * IH Monitoring Cron Job
 * Runs hourly to check for stuck IH shipments and send alerts
 */
import cron from 'node-cron';
import { ihMonitoringService } from './services/ih-monitoring-service';

// Flag to prevent overlapping runs
let isRunning = false;

/**
 * Run IH monitoring check
 */
async function runIHMonitoringCheck(): Promise<void> {
  if (isRunning) {
    console.log('[IH Monitoring Cron] Previous monitoring check is still running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = new Date();
  
  try {
    console.log(`[IH Monitoring Cron] Starting monitoring check at ${startTime.toISOString()}`);
    
    // Run the monitoring check
    await ihMonitoringService.runMonitoringCheck();
    
    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`[IH Monitoring Cron] Monitoring check completed in ${duration}s`);
    
  } catch (error) {
    console.error('[IH Monitoring Cron] Error during monitoring check:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Initialize IH monitoring cron job
 */
export function initializeIHMonitoringCron(): void {
  console.log('[IH Monitoring Cron] Initializing IH monitoring cron job...');
  
  // Run once on startup to check for any stuck shipments
  runIHMonitoringCheck().catch(error => {
    console.error('[IH Monitoring Cron] Error during initial check:', error);
  });
  
  // Schedule to run every hour at minute 0
  // '0 * * * *' means at minute 0 of every hour
  cron.schedule('0 * * * *', () => {
    runIHMonitoringCheck().catch(error => {
      console.error('[IH Monitoring Cron] Error during scheduled check:', error);
    });
  }, {
    timezone: 'UTC',
    scheduled: true
  });
  
  console.log('[IH Monitoring Cron] IH monitoring cron job scheduled to run hourly');
}

// Optional: Manual check function for testing
export async function manualMonitoringCheck(): Promise<void> {
  console.log('[IH Monitoring Cron] Manual check triggered');
  await runIHMonitoringCheck();
}