import { getEnv, isDemoMode } from "@/lib/env";
import type { FabricApiClient } from "./fabric-api-client";
import { RealFabricApiClient } from "./real-fabric-api-client";
import { MockFabricApiClient } from "./mock-fabric-api-client";
import { createFabricTokenProvider } from "./token-provider";

let cached: FabricApiClient | null = null;

/** Factory — the only place `DEMO_MODE` is checked for the Fabric client.
 * Every caller depends on the `FabricApiClient` interface only. */
export function getFabricApiClient(): FabricApiClient {
  if (cached) return cached;
  if (isDemoMode()) {
    cached = new MockFabricApiClient();
  } else {
    const env = getEnv();
    cached = new RealFabricApiClient(env.FABRIC_API_BASE_URL, createFabricTokenProvider());
  }
  return cached;
}

export type { FabricApiClient } from "./fabric-api-client";
export { FabricApiException } from "./types";
export type { FabricApiError, FabricLroResult, FabricPage, FabricRequestOptions } from "./types";
