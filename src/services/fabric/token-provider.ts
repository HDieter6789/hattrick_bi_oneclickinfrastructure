import { getEnv } from "@/lib/env";
import { ServicePrincipalTokenProvider } from "@/lib/entra-client-credentials";
import type { AccessTokenProvider } from "@/lib/entra-client-credentials";

// The OAuth2 client-credentials mechanics live in
// src/lib/entra-client-credentials.ts, shared with services/graph — see
// that file for the rationale. This module only supplies the Fabric
// resource scope and reads the Fabric-specific env vars.
export type { AccessTokenProvider } from "@/lib/entra-client-credentials";
export { ServicePrincipalTokenProvider } from "@/lib/entra-client-credentials";

export function createFabricTokenProvider(): AccessTokenProvider {
  const env = getEnv();
  if (!env.FABRIC_TENANT_ID || !env.FABRIC_SERVICE_PRINCIPAL_CLIENT_ID || !env.FABRIC_SERVICE_PRINCIPAL_CLIENT_SECRET) {
    throw new Error(
      "Fabric service principal credentials are not configured (FABRIC_TENANT_ID / FABRIC_SERVICE_PRINCIPAL_CLIENT_ID / FABRIC_SERVICE_PRINCIPAL_CLIENT_SECRET)",
    );
  }
  return new ServicePrincipalTokenProvider(
    "https://api.fabric.microsoft.com/.default",
    env.FABRIC_TENANT_ID,
    env.FABRIC_SERVICE_PRINCIPAL_CLIENT_ID,
    env.FABRIC_SERVICE_PRINCIPAL_CLIENT_SECRET,
  );
}
