/**
 * Shared client-side fetch helper. Mirrors
 * `src/components/admin-portal/api.ts` (same shape, same error mapping) so
 * the provisioning wizard and customer portal — both built after that
 * module — share one implementation instead of each inventing its own.
 * Deliberately depends only on the platform `fetch` API, so it is safe to
 * import from any "use client" component.
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
