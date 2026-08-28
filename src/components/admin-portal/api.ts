/**
 * Shared client-side fetch helper for the admin portal UI pages. Mirrors
 * the local `fetchJson` helper already used by
 * `src/components/appointments/appointment-picker.tsx`, pulled out here so
 * every admin page (customers/blueprints/fabric-registry/service-agents/
 * alerts/audit-log) shares one implementation instead of redefining it.
 *
 * Deliberately talks only to `/api/admin/**` and `/api/service-agents/**`
 * routes over plain `fetch` — it has no dependency on any server-only
 * module, so it is safe to import from "use client" components.
 */

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

/** Fetches `url` and parses the JSON body, throwing `ApiRequestError` (with
 * the server's `{ error: string }` message when present) for non-2xx
 * responses. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request to ${url} failed (HTTP ${response.status})`;
    throw new ApiRequestError(message, response.status);
  }
  return body as T;
}

export function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}
