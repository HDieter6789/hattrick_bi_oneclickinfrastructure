import { isDemoMode } from "@/lib/env";
import type { OAuthConnectionService } from "./oauth-connection-service";
import { RealOAuthConnectionService } from "./oauth-connection-service";
import { MockOAuthConnectionService } from "./mock-oauth-connection-service";

let cachedOAuthService: OAuthConnectionService | null = null;

/** Factory — the only place `DEMO_MODE` is checked for the OAuth connect
 * flow. Every caller depends on the `OAuthConnectionService` interface
 * only. */
export function getOAuthConnectionService(): OAuthConnectionService {
  if (cachedOAuthService) return cachedOAuthService;
  cachedOAuthService = isDemoMode() ? new MockOAuthConnectionService() : new RealOAuthConnectionService();
  return cachedOAuthService;
}

export type { OAuthConnectionService, OAuthAuthorizationResult, OAuthCallbackResult } from "./oauth-connection-service";
export { connectorRegistry, ConnectorRegistryService } from "./connector-registry-service";
export type { ConnectorSummary } from "./connector-registry-service";
export { fabricConnectionService, FabricConnectionService } from "./fabric-connection-service";
export { upsertConnectionSecret, deleteConnectionSecrets } from "./connection-secret";
