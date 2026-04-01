import { logger } from './logger';

export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  label: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const wait = delayMs * Math.pow(2, attempt - 1);
        logger.warn(`${label} failed (attempt ${attempt}/${maxRetries}), retrying in ${wait}ms...`);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }

  logger.error(`${label} failed after ${maxRetries} attempts`);
  throw lastError;
}
