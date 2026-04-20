import winston from 'winston';
import { env } from '../config/env';

export interface DecisionLogPayload {
  symbol: string;
  recommendation: 'BUY' | 'WATCH' | 'AVOID';
  regime: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | null;
  weightsUsed: { market: number; sector: number; fundamental: number; technical: number } | null;
  scores: { market: number; sector: number; fundamental: number; technical: number; risk?: number; final: number };
  confidence: number;
}

const baseLogger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'stock-analysis' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

/** Extended logger with a structured `decision` event for AI recommendation traceability. */
export const logger = Object.assign(baseLogger, {
  decision(payload: DecisionLogPayload): void {
    baseLogger.info('decision_made', { event: 'decision_made', ...payload });
  },
});
