import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Job payload shapes
// ---------------------------------------------------------------------------

export interface ReceiptEmailJobData {
  tenant_id: string;
  order_id: string;
  to: string;
  receipt_url: string;
}

export interface ReceiptSmsJobData {
  tenant_id: string;
  order_id: string;
  to: string;
  receipt_url: string;
}

export interface EodRollupJobData {
  type: "cron-check" | "rollup";
  tenant_id?: string; // present when type === "rollup"
  date?: string;      // YYYY-MM-DD; present when type === "rollup"
}

// ---------------------------------------------------------------------------
// Redis connection singleton
// ---------------------------------------------------------------------------

let _connection: Redis | null = null;

/**
 * Returns the shared ioredis connection, or null when Redis is not configured.
 * BullMQ requires maxRetriesPerRequest: null on the connection.
 */
export function getRedisConnection(): Redis | null {
  if (!env.UPSTASH_REDIS_URL) return null;
  if (_connection) return _connection;

  _connection = new Redis(env.UPSTASH_REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  _connection.on("error", (err: Error) => {
    logger.error({ err }, "Redis connection error");
  });

  return _connection;
}

// ---------------------------------------------------------------------------
// Queue singletons
// ---------------------------------------------------------------------------

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
};

let _emailQueue: Queue<ReceiptEmailJobData> | null = null;
let _smsQueue: Queue<ReceiptSmsJobData> | null = null;
let _eodRollupQueue: Queue<EodRollupJobData> | null = null;

function getEmailQueue(): Queue<ReceiptEmailJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!_emailQueue) {
    _emailQueue = new Queue<ReceiptEmailJobData>("receipt-email", {
      connection: conn,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _emailQueue;
}

function getSmsQueue(): Queue<ReceiptSmsJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!_smsQueue) {
    _smsQueue = new Queue<ReceiptSmsJobData>("receipt-sms", {
      connection: conn,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _smsQueue;
}

export function getEodRollupQueue(): Queue<EodRollupJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!_eodRollupQueue) {
    _eodRollupQueue = new Queue<EodRollupJobData>("end-of-day-rollup", {
      connection: conn,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _eodRollupQueue;
}

// ---------------------------------------------------------------------------
// Enqueue helpers — fall back to no-op mock when Redis is absent
// ---------------------------------------------------------------------------

/**
 * Enqueue a receipt email delivery job.
 * Returns a job id (or "mock-job-id" in mock mode).
 */
export async function enqueueReceiptEmail(
  data: ReceiptEmailJobData
): Promise<string> {
  const q = getEmailQueue();
  if (!q) {
    logger.info({ data }, "[mock] would enqueue receipt-email job");
    return "mock-job-id";
  }
  const job = await q.add("send", data, DEFAULT_JOB_OPTIONS);
  return job.id ?? "unknown";
}

/**
 * Enqueue a receipt SMS delivery job.
 * Returns a job id (or "mock-job-id" in mock mode).
 */
export async function enqueueReceiptSms(
  data: ReceiptSmsJobData
): Promise<string> {
  const q = getSmsQueue();
  if (!q) {
    logger.info({ data }, "[mock] would enqueue receipt-sms job");
    return "mock-job-id";
  }
  const job = await q.add("send", data, DEFAULT_JOB_OPTIONS);
  return job.id ?? "unknown";
}

// ---------------------------------------------------------------------------
// End-of-day cron scheduler
// ---------------------------------------------------------------------------

/**
 * Registers a BullMQ repeatable job that fires every 5 minutes.
 * The cron-check job inspects all tenants' local time and enqueues
 * per-tenant rollup jobs for tenants whose clock is 00:01–00:06.
 *
 * Uses a fixed jobId so repeated calls are idempotent (no duplicate cron jobs).
 * When Redis is not configured, logs a mock-mode message and returns.
 */
export async function scheduleEodCron(): Promise<void> {
  const queue = getEodRollupQueue();
  if (!queue) {
    logger.info("[mock] cron disabled — UPSTASH_REDIS_URL not set");
    return;
  }

  // BullMQ repeatable job — every 5 minutes
  await queue.add(
    "cron-check",
    { type: "cron-check" },
    {
      repeat: { pattern: "*/5 * * * *" },
      jobId: "eod-cron-check", // fixed id prevents duplicate cron entries
    }
  );

  logger.info("[queue] end-of-day cron scheduled (*/5 * * * *)");
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/** Gracefully close all open queues (call on SIGTERM). */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    _emailQueue?.close(),
    _smsQueue?.close(),
    _eodRollupQueue?.close(),
  ]);
}
