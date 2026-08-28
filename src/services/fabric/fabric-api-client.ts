import type { FabricLroResult, FabricPage, FabricRequestOptions } from "./types";

/**
 * The only interface the rest of the application is allowed to use to
 * talk to Microsoft Fabric. No component, server action, or provisioning
 * step ever issues a raw `fetch` against api.fabric.microsoft.com — every
 * call goes through an implementation of this interface, so:
 *
 *  - auth, retry, backoff, correlation ids and LRO polling live in exactly
 *    one place
 *  - the mock adapter (used in DEMO_MODE) is a drop-in replacement with no
 *    special-casing anywhere else in the codebase
 *
 * See docs/FABRIC_API.md for the full design rationale and how to extend
 * this when Microsoft ships new Fabric APIs.
 */
export interface FabricApiClient {
  get<T>(path: string, options?: FabricRequestOptions): Promise<T>;
  getAllPages<T>(path: string, options?: FabricRequestOptions): Promise<T[]>;
  post<T>(path: string, body?: unknown, options?: FabricRequestOptions): Promise<FabricLroResult<T>>;
  put<T>(path: string, body?: unknown, options?: FabricRequestOptions): Promise<FabricLroResult<T>>;
  patch<T>(path: string, body?: unknown, options?: FabricRequestOptions): Promise<FabricLroResult<T>>;
  delete(path: string, options?: FabricRequestOptions): Promise<void>;
  getPage<T>(path: string, continuationToken?: string, options?: FabricRequestOptions): Promise<FabricPage<T>>;
}
