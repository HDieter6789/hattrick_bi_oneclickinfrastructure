import type { IngestionScheduleFrequency } from "@/generated/prisma/enums";

/**
 * Resolves an `IngestionScheduleFrequency` to the cron expression persisted
 * on `IngestionConfiguration.scheduleCron`. Pure and framework-free so it
 * can be unit tested without a database and reused by the Monitoring
 * Collector (see services/monitoring/collector.ts) to compute freshness
 * windows and "next scheduled load" without parsing cron itself.
 *
 * `manual` has no schedule — the customer or an operator triggers a load
 * on demand, so there is no cron expression to resolve.
 */
export function resolveScheduleCron(frequency: IngestionScheduleFrequency): string | null {
  switch (frequency) {
    case "manual":
      return null;
    case "hourly":
      return "0 * * * *";
    case "every_6_hours":
      return "0 */6 * * *";
    case "daily":
      // 02:00 — off peak, after most source systems have finished their
      // own nightly batch windows.
      return "0 2 * * *";
    case "weekly":
      // Sunday 02:00.
      return "0 2 * * 0";
    default: {
      const exhaustiveCheck: never = frequency;
      throw new Error(`Unhandled IngestionScheduleFrequency: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Companion to `resolveScheduleCron`: the expected interval between runs,
 * in milliseconds, for the same frequency values. Used for freshness/
 * overdue calculations (services/monitoring/status.ts) and for estimating
 * "next scheduled load" without a full cron parser — deliberately
 * approximate (e.g. "weekly" is treated as a fixed 7-day period rather than
 * "next Sunday"), which is sufficient for the business-facing rounding this
 * platform needs.
 */
export function resolveScheduleIntervalMs(frequency: IngestionScheduleFrequency): number | null {
  const HOUR = 60 * 60 * 1000;
  switch (frequency) {
    case "manual":
      return null;
    case "hourly":
      return HOUR;
    case "every_6_hours":
      return 6 * HOUR;
    case "daily":
      return 24 * HOUR;
    case "weekly":
      return 7 * 24 * HOUR;
    default: {
      const exhaustiveCheck: never = frequency;
      throw new Error(`Unhandled IngestionScheduleFrequency: ${String(exhaustiveCheck)}`);
    }
  }
}
