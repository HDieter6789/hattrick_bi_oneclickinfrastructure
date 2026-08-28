import { getEnv } from "@/lib/env";
import { ServicePrincipalTokenProvider } from "@/lib/entra-client-credentials";
import type { AccessTokenProvider } from "@/lib/entra-client-credentials";

/**
 * Graph resource token acquisition. Shares the OAuth2 client-credentials
 * mechanics with services/fabric/token-provider.ts via
 * src/lib/entra-client-credentials.ts (never duplicated) — only the
 * resource scope and env var source differ.
 *
 * Falls back to the Fabric service principal credentials when no
 * Graph-specific ones are configured, since a single Entra app
 * registration commonly holds both Fabric and Graph API permissions
 * (`api.fabric.microsoft.com` + `graph.microsoft.com` scopes on the same
 * app). Set GRAPH_TENANT_ID / GRAPH_SERVICE_PRINCIPAL_CLIENT_ID /
 * GRAPH_SERVICE_PRINCIPAL_CLIENT_SECRET explicitly to use a separate app
 * registration for Graph.
 */
export function createGraphTokenProvider(): AccessTokenProvider {
  const env = getEnv();
  const tenantId = env.GRAPH_TENANT_ID ?? env.FABRIC_TENANT_ID;
  const clientId = env.GRAPH_SERVICE_PRINCIPAL_CLIENT_ID ?? env.FABRIC_SERVICE_PRINCIPAL_CLIENT_ID;
  const clientSecret = env.GRAPH_SERVICE_PRINCIPAL_CLIENT_SECRET ?? env.FABRIC_SERVICE_PRINCIPAL_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph service principal credentials are not configured (set GRAPH_TENANT_ID / GRAPH_SERVICE_PRINCIPAL_CLIENT_ID / GRAPH_SERVICE_PRINCIPAL_CLIENT_SECRET, or the FABRIC_* equivalents if reusing the same app registration)",
    );
  }

  return new ServicePrincipalTokenProvider("https://graph.microsoft.com/.default", tenantId, clientId, clientSecret);
}
