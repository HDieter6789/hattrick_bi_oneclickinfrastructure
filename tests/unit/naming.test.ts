import { describe, expect, it } from "vitest";
import { resolveName, slugify, validateFabricDisplayName } from "@/services/provisioning/naming";

describe("resolveName", () => {
  it("resolves the example from the brief", () => {
    expect(resolveName("{customer}_{environment}_{layer}_{type}", { customer: "Contoso", environment: "PRD", layer: "Bronze", type: "lh" })).toBe(
      "contoso_prd_bronze_lh",
    );
  });

  it("leaves unresolved tokens visible rather than dropping them", () => {
    expect(resolveName("{customer}_{unknown}", { customer: "Contoso", environment: "prd" })).toBe("contoso_{unknown}");
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alphanumerics", () => {
    expect(slugify("Contoso Retail GmbH!")).toBe("contoso_retail_gmbh");
  });
});

describe("validateFabricDisplayName", () => {
  it("accepts a clean name", () => {
    expect(validateFabricDisplayName("contoso_prd_gld_lh").valid).toBe(true);
  });

  it("rejects invalid characters", () => {
    expect(validateFabricDisplayName("contoso/prd:gold").valid).toBe(false);
  });

  it("rejects unresolved template tokens", () => {
    expect(validateFabricDisplayName("contoso_{unknown}").valid).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(validateFabricDisplayName("").valid).toBe(false);
  });
});
