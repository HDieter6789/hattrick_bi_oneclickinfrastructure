/**
 * Pure query-string builder for the admin portal's filterable list pages
 * (customers/alerts/audit-log). Kept dependency-free (no fetch, no React)
 * so it can be unit-tested directly — see tests/unit/admin-ui-query-params.test.ts.
 */

export type QueryParamValue = string | number | boolean | undefined | null;

/** Builds a `?a=1&b=2`-style query string from a flat params object,
 * omitting `undefined`/`null`/empty-string values so an unset filter never
 * becomes a literal `"undefined"` (or an accidental empty-string match)
 * on the wire. Returns `""` (not `"?"`) when every value is omitted. */
export function buildQueryString(params: Record<string, QueryParamValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
