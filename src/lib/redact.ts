/**
 * Explicit redaction helper for anything persisted (AuditLog.metadata,
 * DeploymentStep.requestMetadata/responseMetadata, Notification bodies).
 * Logger-level redaction (src/lib/logger.ts) is a backstop — this is the
 * primary control for data that outlives a single process's log stream.
 */

const SENSITIVE_KEY_PATTERN =
  /^(password|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|secret|authorization|credential|connectionstring|sas|shared[_-]?access[_-]?signature)$/i;

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[CIRCULAR]";
    seen.add(obj);

    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactValue(val, seen);
      }
    }
    return output;
  }

  return value;
}

/** Redacts, then JSON-round-trips to guarantee the result is Prisma
 * `Json`-column safe (no undefined, functions, etc.). */
export function redactForPersistence(value: unknown): unknown {
  const redacted = redactValue(value);
  return redacted === undefined ? null : JSON.parse(JSON.stringify(redacted));
}
