import { randomUUID } from "node:crypto";
import { childLogger } from "@/lib/logger";
import { redactForPersistence } from "@/lib/redact";
import type { FabricApiClient } from "./fabric-api-client";
import { FabricApiException } from "./types";
import type { FabricApiError, FabricLroResult, FabricPage, FabricRequestOptions } from "./types";
import type { AccessTokenProvider } from "./token-provider";

const log = childLogger({ module: "fabric.client" });

const MAX_RETRIES = 4;
const MAX_LRO_POLLS = 120; // ~ safety cap regardless of Retry-After cadence
const DEFAULT_POLL_INTERVAL_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Production Fabric REST API client. Implements:
 *  - bearer auth via the injected AccessTokenProvider
 *  - correlation id propagation
 *  - 202 Accepted / Long Running Operation polling (Location header →
 *    GET /operations/{id} until Succeeded|Failed|Cancelled → /result)
 *  - exponential backoff with jitter on 429/5xx, honoring Retry-After
 *  - distinguishing RequestBlocked (caller-scoped throttling, retry) from
 *    CapacityLimitExceeded (tenant capacity overloaded, surfaced to the
 *    caller instead of being silently retried)
 *
 * See docs/FABRIC_API.md for the source documentation this is built
 * against.
 */
export class RealFabricApiClient implements FabricApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: AccessTokenProvider,
  ) {}

  async get<T>(path: string, options?: FabricRequestOptions): Promise<T> {
    const result = await this.request<T>("GET", path, undefined, options);
    return result.result as T;
  }

  async getPage<T>(path: string, continuationToken?: string, options?: FabricRequestOptions): Promise<FabricPage<T>> {
    const query = { ...options?.query, ...(continuationToken ? { continuationToken } : {}) };
    const result = await this.request<{ value: T[]; continuationToken?: string }>("GET", path, undefined, {
      ...options,
      query,
    });
    const body = result.result;
    return { items: body?.value ?? [], continuationToken: body?.continuationToken ?? null };
  }

  async getAllPages<T>(path: string, options?: FabricRequestOptions): Promise<T[]> {
    const items: T[] = [];
    let token: string | undefined;
    do {
      const page = await this.getPage<T>(path, token, options);
      items.push(...page.items);
      token = page.continuationToken ?? undefined;
    } while (token);
    return items;
  }

  post<T>(path: string, body?: unknown, options?: FabricRequestOptions): Promise<FabricLroResult<T>> {
    return this.request<T>("POST", path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: FabricRequestOptions): Promise<FabricLroResult<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: FabricRequestOptions): Promise<FabricLroResult<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  async delete(path: string, options?: FabricRequestOptions): Promise<void> {
    await this.request("DELETE", path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    options?: FabricRequestOptions,
    attempt = 1,
  ): Promise<FabricLroResult<T>> {
    const correlationId = options?.correlationId ?? randomUUID();
    const token = await this.tokenProvider.getToken();
    const url = this.buildUrl(path, options?.query);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-ms-client-request-id": correlationId,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429 || response.status >= 500) {
      if (attempt <= MAX_RETRIES) {
        const error = await this.parseError(response, correlationId);
        if (error.errorCode === "CapacityLimitExceeded") {
          // Tenant capacity is overloaded — retrying immediately will not
          // help; surface it so the provisioning engine can mark the step
          // failed with an actionable message instead of busy-looping.
          throw new FabricApiException(error);
        }
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        const backoffMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30_000);
        log.warn({ correlationId, status: response.status, attempt, backoffMs }, "Retrying Fabric API call");
        await sleep(backoffMs + Math.random() * 250);
        return this.request<T>(method, path, body, { ...options, correlationId }, attempt + 1);
      }
    }

    if (response.status === 202) {
      return this.pollLongRunningOperation<T>(response, correlationId);
    }

    if (!response.ok) {
      throw new FabricApiException(await this.parseError(response, correlationId));
    }

    if (response.status === 204) {
      return { operationId: null, status: "Succeeded", result: null, error: null };
    }

    const result = (await response.json().catch(() => null)) as T | null;
    return { operationId: null, status: "Succeeded", result, error: null };
  }

  private async pollLongRunningOperation<T>(response: Response, correlationId: string): Promise<FabricLroResult<T>> {
    const operationId = response.headers.get("x-ms-operation-id");
    const location = response.headers.get("Location");
    if (!operationId || !location) {
      throw new FabricApiException({
        status: 202,
        message: "Fabric returned 202 Accepted without operation tracking headers",
        requestId: correlationId,
      });
    }

    let pollUrl = location;
    for (let i = 0; i < MAX_LRO_POLLS; i++) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : DEFAULT_POLL_INTERVAL_MS;
      await sleep(waitMs);

      const token = await this.tokenProvider.getToken();
      response = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}`, "x-ms-client-request-id": correlationId },
      });

      if (!response.ok) {
        throw new FabricApiException(await this.parseError(response, correlationId));
      }

      const state = (await response.json()) as { status: string; percentComplete?: number };
      log.debug({ correlationId, operationId, status: state.status }, "Polled Fabric LRO");

      if (state.status === "Succeeded") {
        const resultResponse = await fetch(`${pollUrl}/result`, {
          headers: { Authorization: `Bearer ${token}`, "x-ms-client-request-id": correlationId },
        });
        const result = resultResponse.ok ? ((await resultResponse.json().catch(() => null)) as T | null) : null;
        return { operationId, status: "Succeeded", result, error: null };
      }

      if (state.status === "Failed" || state.status === "Cancelled") {
        return {
          operationId,
          status: state.status,
          result: null,
          error: { status: 200, message: `Fabric operation ${state.status.toLowerCase()}`, requestId: correlationId },
        };
      }
      // NotStarted | Running -> keep polling the same pollUrl.
      pollUrl = location;
    }

    throw new FabricApiException({
      status: 202,
      message: `Long running operation ${operationId} did not complete within the polling budget`,
      requestId: correlationId,
    });
  }

  private async parseError(response: Response, correlationId: string): Promise<FabricApiError> {
    const raw = await response.json().catch(() => null);
    return {
      status: response.status,
      errorCode: raw && typeof raw === "object" && "errorCode" in raw ? String(raw.errorCode) : undefined,
      message:
        raw && typeof raw === "object" && "message" in raw
          ? String(raw.message)
          : `Fabric API request failed with status ${response.status}`,
      requestId: response.headers.get("x-ms-request-id") ?? correlationId,
      details: redactForPersistence(raw),
    };
  }

  private buildUrl(path: string, query?: FabricRequestOptions["query"]): string {
    const url = new URL(path.startsWith("http") ? path : `${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}
