/**
 * The only interface the rest of the application is allowed to use to
 * store/retrieve credential material. No component, server action, or
 * service ever writes a raw secret value to Prisma — every credential goes
 * through an implementation of this interface, and only the opaque
 * `secretReference` it returns is ever persisted (see
 * `ConnectionSecretReference.secretReference` in prisma/schema/connection.prisma).
 *
 * Mirrors the `FabricApiClient` interface + real/mock adapter pattern in
 * services/fabric — see services/secrets/index.ts for the DEMO_MODE switch.
 */

export interface StoreSecretParams {
  customerId: string;
  connectionId: string;
  value: string;
}

export interface SecretProvider {
  /** Stores `value` and returns an opaque reference safe to persist in the
   * database. The reference alone must never be sufficient to reconstruct
   * the secret outside this provider (e.g. a Key Vault secret name, not
   * the value itself, not a reversible encoding of it). */
  storeSecret(params: StoreSecretParams): Promise<{ secretReference: string }>;

  /** Resolves a previously stored secret's plaintext value. Callers must
   * never log or persist the returned value — it exists only for the
   * lifetime of the call that needs it (e.g. building a Fabric connection
   * creation request). */
  getSecret(secretReference: string): Promise<string>;

  deleteSecret(secretReference: string): Promise<void>;
}
