import { PredictionEvaluatorService } from '../services/prediction-evaluator.service';
import { logger } from '../utils/logger';

const evaluator = new PredictionEvaluatorService();

export async function evaluatePredictionsJob(): Promise<void> {
  try {
    const result = await evaluator.evaluateAll();
    logger.info(`Evaluate predictions job completed: ${result.evaluated} evaluated, ${result.skipped} skipped`);
  } catch (error) {
    logger.error('Evaluate predictions job failed:', error);
  }
}
