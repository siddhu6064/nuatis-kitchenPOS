/**
 * Rate-limiting middleware for brute-force-sensitive auth endpoints.
 *
 * Uses express-rate-limit v7 with the default in-memory MemoryStore.
 *
 * LIMITATION: The in-memory store resets on process restart and is not shared
 * between multiple instances. For a multi-instance (horizontally-scaled)
 * deployment, replace MemoryStore with a Redis-backed store, e.g.:
 *
 *   import { RedisStore } from "rate-limit-redis";
 *   import { getRedisConnection } from "../lib/queue.js";
 *   store: new RedisStore({ sendCommand: (...args) => getRedisConnection()?.call(...args) })
 *
 * This limitation is acceptable for the single-instance pilot.
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Shared handler — emits the standard { error: { code, message, retry_after_seconds } }
// shape that matches the rest of the API's 4xx convention.
// ---------------------------------------------------------------------------
function makeHandler(windowMs: number) {
  return (req: Request, res: Response): void => {
    // express-rate-limit augments Express.Request with .rateLimit at runtime;
    // we cast through unknown here to avoid the module-augmentation gap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resetTime: Date | undefined = (req as any).rateLimit?.resetTime as Date | undefined;
    const retryAfterMs = resetTime instanceof Date
      ? Math.max(0, resetTime.getTime() - Date.now())
      : windowMs;

    res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Too many requests. Please try again later.",
        retry_after_seconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      },
    });
  };
}

// ---------------------------------------------------------------------------
// Auth — sign-in + PIN: 5 attempts per 15 minutes per IP
// ---------------------------------------------------------------------------
const AUTH_WINDOW_MS = 15 * 60 * 1000;

export const authSignInLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: 5,
  standardHeaders: true,  // emit RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  handler: makeHandler(AUTH_WINDOW_MS),
});

export const authPinLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(AUTH_WINDOW_MS),
});

// ---------------------------------------------------------------------------
// Sign-up: 3 registrations per hour per IP
// ---------------------------------------------------------------------------
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

export const signUpLimiter = rateLimit({
  windowMs: SIGNUP_WINDOW_MS,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(SIGNUP_WINDOW_MS),
});
