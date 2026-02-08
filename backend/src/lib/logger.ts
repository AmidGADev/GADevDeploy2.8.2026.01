import type { Context, Next } from "hono";
import { randomUUID } from "crypto";
import { isDebugEnabled } from "./debug";
import { redactObject, redactString, redactError } from "./redact";

/**
 * Structured Logging System with Request Tracing
 *
 * All logs go to stdout/stderr for Render to capture.
 * Log format: [SUBSYSTEM] message { context }
 *
 * SECURITY: All log contexts are automatically redacted to prevent secret leakage.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: string;
  userRole?: string;
  method?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
  error?: Error | string;
  [key: string]: any;
}

type LogSubsystem =
  | "AUTH"
  | "EMAIL"
  | "INSURANCE"
  | "WEBHOOK"
  | "JOBS"
  | "DB"
  | "API"
  | "DEBUG"
  | "STRIPE"
  | "AUDIT";

/**
 * Format log context as JSON for structured logging
 * SECURITY: Automatically redacts sensitive data
 */
function formatContext(ctx: LogContext): string {
  // Redact the entire context object
  const redactedCtx = redactObject(ctx);

  // Remove undefined values and errors (handle separately)
  const cleanCtx: Record<string, any> = {};
  for (const [key, value] of Object.entries(redactedCtx)) {
    if (value !== undefined && key !== "error") {
      cleanCtx[key] = value;
    }
  }

  // Handle error separately with redaction
  if (ctx.error) {
    cleanCtx.error = redactError(ctx.error);
    // Only include stack in debug mode
    if (!isDebugEnabled() && cleanCtx.error.stack) {
      delete cleanCtx.error.stack;
    }
  }

  return Object.keys(cleanCtx).length > 0 ? JSON.stringify(cleanCtx) : "";
}

/**
 * Create a logger for a specific subsystem
 */
export function createLogger(subsystem: LogSubsystem) {
  const log = (level: LogLevel, message: string, context: LogContext = {}) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${subsystem}]`;
    const contextStr = formatContext(context);

    const logLine = contextStr
      ? `${prefix} ${message} ${contextStr}`
      : `${prefix} ${message}`;

    switch (level) {
      case "error":
        console.error(logLine);
        break;
      case "warn":
        console.warn(logLine);
        break;
      case "debug":
        // Only log debug in debug mode
        if (isDebugEnabled()) {
          console.log(logLine);
        }
        break;
      default:
        console.log(logLine);
    }
  };

  return {
    debug: (message: string, context?: LogContext) => log("debug", message, context),
    info: (message: string, context?: LogContext) => log("info", message, context),
    warn: (message: string, context?: LogContext) => log("warn", message, context),
    error: (message: string, context?: LogContext) => log("error", message, context),
  };
}

// Pre-created loggers for each subsystem
export const authLogger = createLogger("AUTH");
export const emailLogger = createLogger("EMAIL");
export const insuranceLogger = createLogger("INSURANCE");
export const webhookLogger = createLogger("WEBHOOK");
export const jobsLogger = createLogger("JOBS");
export const dbLogger = createLogger("DB");
export const apiLogger = createLogger("API");
export const debugLogger = createLogger("DEBUG");
export const stripeLogger = createLogger("STRIPE");
export const auditLogger = createLogger("AUDIT");

/**
 * Request context storage (for accessing requestId in nested functions)
 */
const requestContextStore = new Map<string, LogContext>();

export function setRequestContext(requestId: string, context: LogContext) {
  requestContextStore.set(requestId, context);
}

export function getRequestContext(requestId: string): LogContext | undefined {
  return requestContextStore.get(requestId);
}

export function clearRequestContext(requestId: string) {
  requestContextStore.delete(requestId);
}

/**
 * Request tracing middleware
 * Adds x-request-id to all responses and logs request/response details
 */
export async function requestTracingMiddleware(c: Context, next: Next) {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Store request context
  const context: LogContext = {
    requestId,
    method: c.req.method,
    route: c.req.path,
  };
  setRequestContext(requestId, context);

  // Add requestId to response header
  c.header("x-request-id", requestId);

  // Store requestId in context for other middleware/routes to access
  c.set("requestId", requestId);

  try {
    await next();

    const durationMs = Date.now() - startTime;
    const user = c.get("user") as any;

    apiLogger.info(`${c.req.method} ${c.req.path}`, {
      requestId,
      method: c.req.method,
      route: c.req.path,
      statusCode: c.res.status,
      durationMs,
      userId: user?.id,
      userRole: user?.role,
    });
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const user = c.get("user") as any;

    apiLogger.error(`${c.req.method} ${c.req.path} failed`, {
      requestId,
      method: c.req.method,
      route: c.req.path,
      durationMs,
      userId: user?.id,
      userRole: user?.role,
      error,
    });

    throw error;
  } finally {
    clearRequestContext(requestId);
  }
}

/**
 * Get the current request ID from context
 */
export function getRequestId(c: Context): string {
  return c.get("requestId") || "unknown";
}

/**
 * Create a safe error response for clients (no stack traces, no internal details)
 * Use this for all error responses to prevent information leakage
 */
export function safeErrorResponse(
  message: string,
  code: string = "INTERNAL_ERROR"
): { error: { message: string; code: string } } {
  // Redact any sensitive data that might be in the message
  const safeMessage = redactString(message);

  return {
    error: {
      message: safeMessage,
      code,
    },
  };
}
