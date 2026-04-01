import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const analysisLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // AI analysis is expensive
  message: { success: false, error: 'Analysis rate limit exceeded, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});
