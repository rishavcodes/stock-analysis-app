import { AlertService } from '../services/alert.service';
import { logger } from '../utils/logger';

const alertService = new AlertService();

export async function checkAlertsJob(): Promise<void> {
  try {
    const triggered = await alertService.evaluateAlerts();
    if (triggered.length > 0) {
      logger.info(`${triggered.length} alerts triggered`);
    }
  } catch (error) {
    logger.error('Check alerts job failed:', error);
  }
}
