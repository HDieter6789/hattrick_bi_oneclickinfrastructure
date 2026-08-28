import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { childLogger } from "@/lib/logger";
import { createConnectionInput } from "@/schemas/connection";
import { connectorRegistry, fabricConnectionService, upsertConnectionSecret } from "@/services/connections";
import type { Prisma } from "@/generated/prisma/client";

const log = childLogger({ module: "api.connections" });

/** Auth methods that require the interactive OAuth2 "Connect" flow before a
 * Fabric connection can be created — see OAuthConnectionService. Every
 * other auth method (including secret-free ones like Anonymous) can create
 * the Fabric connection immediately once this record exists. */
const AUTH_METHODS_REQUIRING_OAUTH_FLOW = new Set(["OAuth2", "OrganizationalAccount"]);

/** GET /api/connections?customerId=... — list a customer's connections. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (!customerId) {
      return Response.json({ error: "customerId query parameter is required" }, { status: 400 });
    }
    await requireCustomerAccess(customerId);

    const connections = await prisma.connection.findMany({
      where: { customerId },
      include: { connector: { select: { displayName: true, category: true, iconKey: true } } },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ connections });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/connections — create a connection for a customer. Never
 * accepts or returns a raw credential: `secretValue` (if present) is
 * routed straight to SecretProvider and only its opaque reference is ever
 * persisted or echoed back. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const input = createConnectionInput.parse(body);
    await requireCustomerAccess(input.customerId);

    const connector = await connectorRegistry.getConnector(input.connectorTypeKey);
    if (!connector || !connector.enabled) {
      return Response.json({ error: `Unknown or disabled connector type: ${input.connectorTypeKey}` }, { status: 400 });
    }
    const supportedAuthMethods = connector.supportedCredentialTypesJson as unknown as string[];
    if (Array.isArray(supportedAuthMethods) && supportedAuthMethods.length > 0 && !supportedAuthMethods.includes(input.authMethod)) {
      return Response.json(
        { error: `Connector "${input.connectorTypeKey}" does not support auth method "${input.authMethod}"` },
        { status: 400 },
      );
    }

    let connection = await prisma.connection.create({
      data: {
        customerId: input.customerId,
        infrastructureConfigurationId: input.infrastructureConfigurationId,
        connectorTypeKey: input.connectorTypeKey,
        displayName: input.displayName,
        authMethod: input.authMethod,
        parametersJson: input.parameters as Prisma.InputJsonValue,
        status: "draft",
      },
    });

    if (input.secretValue) {
      await upsertConnectionSecret({
        customerId: input.customerId,
        connectionId: connection.id,
        connectionType: input.connectorTypeKey,
        value: input.secretValue,
      });
    }

    let warning: string | undefined;
    if (!AUTH_METHODS_REQUIRING_OAUTH_FLOW.has(input.authMethod)) {
      try {
        connection = await fabricConnectionService.createFabricConnection(connection.id);
      } catch (error) {
        // The Connection row exists (status "error", set inside
        // createFabricConnection) even if the Fabric-side call failed —
        // return it rather than a bare 500 so the caller can inspect/retry.
        warning = error instanceof Error ? error.message : "Fabric connection creation failed";
        connection = await prisma.connection.findUniqueOrThrow({ where: { id: connection.id } });
      }
    }

    log.info({ connectionId: connection.id, customerId: input.customerId, connectorTypeKey: input.connectorTypeKey }, "Connection created");
    return Response.json({ connection, warning }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
