import { describe, expect, it } from "vitest";
import { MockSecretProvider } from "@/services/secrets/mock-secret-provider";

describe("MockSecretProvider", () => {
  it("round-trips a stored secret through its opaque reference", async () => {
    const provider = new MockSecretProvider();
    const { secretReference } = await provider.storeSecret({
      customerId: "cust_1",
      connectionId: "conn_1",
      value: "super-secret-password",
    });

    expect(secretReference).not.toContain("super-secret-password");
    await expect(provider.getSecret(secretReference)).resolves.toBe("super-secret-password");
  });

  it("returns distinct references for repeated stores, without clobbering earlier secrets", async () => {
    const provider = new MockSecretProvider();
    const first = await provider.storeSecret({ customerId: "cust_1", connectionId: "conn_1", value: "value-a" });
    const second = await provider.storeSecret({ customerId: "cust_1", connectionId: "conn_1", value: "value-b" });

    expect(first.secretReference).not.toBe(second.secretReference);
    await expect(provider.getSecret(first.secretReference)).resolves.toBe("value-a");
    await expect(provider.getSecret(second.secretReference)).resolves.toBe("value-b");
  });

  it("throws for an unknown reference", async () => {
    const provider = new MockSecretProvider();
    await expect(provider.getSecret("mock-secret://nope")).rejects.toThrow();
  });

  it("deletes a secret so it can no longer be resolved", async () => {
    const provider = new MockSecretProvider();
    const { secretReference } = await provider.storeSecret({ customerId: "cust_1", connectionId: "conn_1", value: "value" });
    await provider.deleteSecret(secretReference);
    await expect(provider.getSecret(secretReference)).rejects.toThrow();
  });

  it("deleting an already-deleted (or unknown) reference is a no-op, not an error", async () => {
    const provider = new MockSecretProvider();
    await expect(provider.deleteSecret("mock-secret://never-existed")).resolves.toBeUndefined();
  });
});
