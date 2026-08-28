/** Shared types for the Fabric service layer. Kept framework-free so they
 * can be imported from both server actions and background job runners. */

export interface FabricRequestOptions {
  /** Correlation id threaded through logs and (where supported) sent as a
   * request header, so a single provisioning step's calls can be traced
   * end to end. */
  correlationId?: string;
  /** Additional query parameters. */
  query?: Record<string, string | number | boolean | undefined>;
}

export interface FabricApiError {
  status: number;
  errorCode?: string;
  message: string;
  requestId?: string;
  /** Raw response body, already redacted of anything sensitive — safe to
   * log/persist. */
  details?: unknown;
}

export class FabricApiException extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(error: FabricApiError) {
    super(error.message);
    this.name = "FabricApiException";
    this.status = error.status;
    this.errorCode = error.errorCode;
    this.requestId = error.requestId;
    this.details = error.details;
  }

  /** True for 429 responses where the *tenant capacity* itself is
   * overloaded (CapacityLimitExceeded) rather than the caller's own rate
   * limit (RequestBlocked) — retrying immediately will not help. */
  get isCapacityLimit(): boolean {
    return this.status === 429 && this.errorCode === "CapacityLimitExceeded";
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** Result of a call that may have completed synchronously (200/201/204) or
 * asynchronously via a Long Running Operation (202) that this client
 * already polled to completion. */
export interface FabricLroResult<T> {
  operationId: string | null;
  status: "Succeeded" | "Failed" | "Cancelled";
  result: T | null;
  error: FabricApiError | null;
}

export interface FabricPage<T> {
  items: T[];
  continuationToken: string | null;
}
