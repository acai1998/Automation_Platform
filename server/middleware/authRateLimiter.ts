import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger, LOG_CONTEXTS } from '../config/logging';

/**
 * Authentication Rate Limiter Middleware
 *
 * Provides rate limiting protection for authentication endpoints to prevent:
 * - Brute force attacks
 * - Account enumeration
 * - Email bombing
 * - Token flooding
 * - Resource exhaustion
 *
 * Uses express-rate-limit with IP-based tracking for unauthenticated routes
 * and IP+User tracking for authenticated routes.
 */

// Base configuration shared by all auth rate limiters
const baseConfig = {
  standardHeaders: true, // Return rate limit info in RateLimit-* headers (RFC draft)
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: (req: Request, res: Response) => {
    // Log security violation for monitoring and analysis
    logger.warn('Rate limit exceeded', {
      context: LOG_CONTEXTS.SECURITY,
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
    });

    // Return consistent 429 response with retry information
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Please try again later',
      retryAfter: res.getHeader('RateLimit-Reset'),
    });
  },
};

/**
 * Login Rate Limiter
 *
 * Limit: 5 requests per 15 minutes per IP
 *
 * Rationale:
 * - Matches existing account lockout (5 failed attempts)
 * - Prevents distributed brute force attacks across multiple IPs
 * - Complements user-level protection with network-level defense
 */
export const loginRateLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes',
  skipSuccessfulRequests: false, // Count all requests (success or fail)
});

/**
 * Registration Rate Limiter
 *
 * Limit: 3 requests per hour per IP
 *
 * Rationale:
 * - Prevents spam account creation
 * - Protects against account enumeration
 * - Legitimate users rarely need multiple registration attempts
 */
export const registerRateLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many registration attempts, please try again later',
});

/**
 * Forgot Password Rate Limiter
 *
 * Limit: 3 requests per hour per IP
 *
 * Rationale:
 * - Prevents email bombing attacks
 * - Protects mail server resources
 * - Prevents user enumeration through password reset
 */
export const forgotPasswordRateLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset requests, please try again later',
});

/**
 * Reset Password Rate Limiter
 *
 * Limit: 5 requests per 15 minutes per IP
 *
 * Rationale:
 * - Allows legitimate retry attempts
 * - Prevents token guessing attacks
 * - Balances security with user experience
 */
export const resetPasswordRateLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many password reset attempts, please try again later',
});

/**
 * Token Refresh Rate Limiter
 *
 * Limit: 10 requests per 15 minutes per IP+User
 *
 * Rationale:
 * - Higher limit for legitimate token rotation
 * - Prevents token refresh flooding
 * - Supports active user sessions
 * - Uses IP+User key to prevent abuse from multiple IPs
 */
export const refreshRateLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many token refresh requests, please try again later',
  // Uses default IP-based key generator (IPv6-safe)
});

/**
 * General Auth Rate Limiter
 *
 * Limit: 100 requests per 15 minutes per IP+User
 *
 * Used for less sensitive authenticated endpoints:
 * - GET /me (user info retrieval)
 * - POST /logout (logout operation)
 *
 * Rationale:
 * - Read-only or low-risk operations
 * - Higher limit allows dashboard polling
 * - Prevents resource exhaustion
 */
export const generalAuthRateLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later',
  // Uses default IP-based key generator (IPv6-safe)
});
