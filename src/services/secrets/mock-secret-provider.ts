import { randomUUID } from "node:crypto";
import { childLogger } from "@/lib/logger";
import type { SecretProvider, StoreSecretParams } from "./secret-provider";

const log = childLogger({ module: "secrets.mock-provider" });

/**
 * In-memory `SecretProvider` used when DEMO_MODE=true. Behaves like a real
 * vault scoped by an opaque reference so provisioning/connection flows can
 * be exercised meaningfully without Azure Key Vault access. Never used in
 * production — see services/secrets/index.ts for the selection logic.
 *
 * The secret value is NEVER logged — only the opaque reference and the
 * customer/connection ids it was stored under.
 */
export class MockSecretProvider implements SecretProvider {
  private readonly store = new Map<string, string>();

  async storeSecret(params: StoreSecretParams): Promise<{ secretReference: string }> {
    const secretReference = `mock-secret://${params.customerId}/${params.connectionId}/${randomUUID()}`;
    this.store.set(secretReference, params.value);
    log.debug({ secretReference, customerId: params.customerId, connectionId: params.connectionId }, "Secret stored (mock)");
    return { secretReference };
  }

  async getSecret(secretReference: string): Promise<string> {
    const value = this.store.get(secretReference);
    if (value === undefined) {
      throw new Error(`Mock secret not found for reference: ${secretReference}`);
    }
    return value;
  }

  async deleteSecret(secretReference: string): Promise<void> {
    this.store.delete(secretReference);
    log.debug({ secretReference }, "Secret deleted (mock)");
  }
}
