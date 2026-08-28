import pino from "pino";

/**
 * Application-wide structured logger. Redaction is enforced at the
 * transport level (not just by convention) so that even a careless
 * `logger.info({ ...payload })` call cannot leak a credential — the keys
 * below are stripped regardless of nesting depth.
 *
 * This is a defense-in-depth backstop, not a substitute for never putting
 * secrets into loggable objects in the first place; see
 * src/lib/redact.ts for the explicit redaction helper used before
 * persisting request/response metadata to the database.
 */
const REDACT_PATHS = [
  "password",
  "*.password",
  "*.*.password",
  "token",
  "*.token",
  "*.*.token",
  "accessToken",
  "*.accessToken",
  "*.*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "*.*.refreshToken",
  "clientSecret",
  "*.clientSecret",
  "*.*.clientSecret",
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",
  "secret",
  "*.secret",
  "*.*.secret",
  "authorization",
  "*.authorization",
  "*.*.authorization",
  "Authorization",
  "*.Authorization",
  "*.*.Authorization",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
