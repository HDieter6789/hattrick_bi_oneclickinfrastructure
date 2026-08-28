import { isDemoMode } from "@/lib/env";
import type { SecretProvider } from "./secret-provider";
import { MockSecretProvider } from "./mock-secret-provider";
import { KeyVaultSecretProvider } from "./keyvault-secret-provider";

let cached: SecretProvider | null = null;

/** Factory — the only place `DEMO_MODE` is checked for secret storage.
 * Every caller depends on the `SecretProvider` interface only. */
export function getSecretProvider(): SecretProvider {
  if (cached) return cached;
  cached = isDemoMode() ? new MockSecretProvider() : new KeyVaultSecretProvider();
  return cached;
}

export type { SecretProvider, StoreSecretParams } from "./secret-provider";
