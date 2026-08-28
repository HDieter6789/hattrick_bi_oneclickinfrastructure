import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import type { SecretProvider, StoreSecretParams } from "./secret-provider";

const log = childLogger({ module: "secrets.keyvault-provider" });

/**
 * Production `SecretProvider` backed by Azure Key Vault. Authenticates via
 * `DefaultAzureCredential` (managed identity in Azure, `az login` locally,
 * environment credentials in CI) so no additional client secret needs to
 * be managed for Key Vault access itself — only `KEY_VAULT_URL` is read
 * from env (see src/lib/env.ts).
 *
 * The secret's plaintext value is NEVER logged — only the vault-assigned
 * name (the `secretReference` persisted to `ConnectionSecretReference`)
 * and non-sensitive correlation ids.
 */
export class KeyVaultSecretProvider implements SecretProvider {
  private readonly client: SecretClient;

  constructor() {
    const env = getEnv();
    if (!env.KEY_VAULT_URL) {
      throw new Error("KEY_VAULT_URL is not configured — required to use the Key Vault secret provider outside DEMO_MODE");
    }
    this.client = new SecretClient(env.KEY_VAULT_URL, new DefaultAzureCredential());
  }

  async storeSecret(params: StoreSecretParams): Promise<{ secretReference: string }> {
    // Key Vault secret names may only contain alphanumerics and dashes.
    // `connectionId` (a cuid) and a uuid both satisfy that.
    const secretReference = `connection-${params.connectionId}-${randomUUID()}`;
    await this.client.setSecret(secretReference, params.value, {
      contentType: "text/plain",
      tags: { customerId: params.customerId, connectionId: params.connectionId },
    });
    log.info({ secretReference, customerId: params.customerId, connectionId: params.connectionId }, "Secret stored in Key Vault");
    return { secretReference };
  }

  async getSecret(secretReference: string): Promise<string> {
    const secret = await this.client.getSecret(secretReference);
    if (secret.value === undefined) {
      throw new Error(`Key Vault secret has no value for reference: ${secretReference}`);
    }
    return secret.value;
  }

  async deleteSecret(secretReference: string): Promise<void> {
    // Soft-deletes the secret (recoverable per the vault's retention
    // policy). Purging immediately is deliberately not done here — that's
    // an operational/compliance decision, not one this service should make
    // unilaterally.
    const poller = await this.client.beginDeleteSecret(secretReference);
    await poller.pollUntilDone();
    log.info({ secretReference }, "Secret soft-deleted from Key Vault");
  }
}
