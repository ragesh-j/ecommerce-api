import rateLimit from 'express-rate-limit';
import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';

// Limits are disabled in tests, otherwise the many register/login calls would hit 429
const isTest = env.nodeEnv === 'test';

export const createLimiter = ({ windowMs, limit, message, ...options }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false, // no X-RateLimit-* headers
    skip: () => isTest,
    // Goes through the central errorHandler, so the response shape stays consistent
    handler: (_req, _res, next) => next(new ApiError(429, message)),
    ...options,
  });

export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: 'Too many requests, please try again later',
});

// Counts only failed logins (wrong password etc.)
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again after 15 minutes',
});

export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many accounts created from this IP, please try again after an hour',
});