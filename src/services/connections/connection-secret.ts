import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { getSecretProvider } from "@/services/secrets";

const log = childLogger({ module: "connections.connection-secret" });

/**
 * Stores (or replaces) the single credential value for a `Connection`
 * through `SecretProvider`, then records only the opaque reference in
 * `ConnectionSecretReference`. Shared by the create-connection flow and
 * `OAuthConnectionService.handleCallback` so there is exactly one place
 * that ever writes a `ConnectionSecretReference` row.
 *
 * Order of operations matters: the new secret is stored and the DB row is
 * updated to point at it BEFORE the old vault entry is deleted, so a
 * failure deleting the stale secret never leaves the connection without a
 * valid, resolvable reference.
 */
export async function upsertConnectionSecret(params: {
  customerId: string;
  connectionId: string;
  connectionType: string;
  value: string;
}): Promise<{ secretReference: string }> {
  const provider = getSecretProvider();
  const existing = await prisma.connectionSecretReference.findFirst({ where: { connectionId: params.connectionId } });

  const { secretReference } = await provider.storeSecret({
    customerId: params.customerId,
    connectionId: params.connectionId,
    value: params.value,
  });

  if (existing) {
    await prisma.connectionSecretReference.update({
      where: { id: existing.id },
      data: { secretReference, connectionType: params.connectionType },
    });
    try {
      await provider.deleteSecret(existing.secretReference);
    } catch (error) {
      log.warn({ connectionId: params.connectionId, error: error instanceof Error ? error.message : String(error) }, "Failed to delete superseded secret — leaked reference will need manual vault cleanup");
    }
  } else {
    await prisma.connectionSecretReference.create({
      data: {
        connectionId: params.connectionId,
        customerId: params.customerId,
        secretReference,
        connectionType: params.connectionType,
      },
    });
  }

  return { secretReference };
}

export async function deleteConnectionSecrets(connectionId: string): Promise<void> {
  const provider = getSecretProvider();
  const references = await prisma.connectionSecretReference.findMany({ where: { connectionId } });
  for (const ref of references) {
    try {
      await provider.deleteSecret(ref.secretReference);
    } catch (error) {
      log.warn({ connectionId, error: error instanceof Error ? error.message : String(error) }, "Failed to delete connection secret from vault");
    }
  }
  await prisma.connectionSecretReference.deleteMany({ where: { connectionId } });
}
