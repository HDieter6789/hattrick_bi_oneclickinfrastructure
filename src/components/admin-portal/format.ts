/**
 * Small date-formatting helpers for the admin portal. Every timestamp
 * rendered here started as a Prisma `DateTime` (typed as `Date` in the
 * feature-module return types this UI imports `import type`-only), but
 * arrives over the wire as a JSON string once serialized by
 * `Response.json()` — `value instanceof Date` narrows the union so this
 * works correctly for both the type-level `Date` and the runtime `string`.
 */

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}
