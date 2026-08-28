import { describe, expect, it } from "vitest";
import { buildFabricPayload, mergeConfigurationModes } from "@/services/fabric/payload-builder";

describe("buildFabricPayload", () => {
  it("places values at their targetPath", () => {
    const payload = buildFabricPayload(
      [
        { key: "displayName", targetPath: "displayName" },
        { key: "enableSchemas", targetPath: "creationPayload.enableSchemas" },
      ],
      { displayName: "contoso_prd_gld_lh", enableSchemas: true },
    );
    expect(payload).toEqual({ displayName: "contoso_prd_gld_lh", creationPayload: { enableSchemas: true } });
  });

  it("skips undefined and empty-string values", () => {
    const payload = buildFabricPayload(
      [
        { key: "description", targetPath: "description" },
        { key: "displayName", targetPath: "displayName" },
      ],
      { description: "", displayName: "x" },
    );
    expect(payload).toEqual({ displayName: "x" });
  });

  it("does not mutate the base object", () => {
    const base = { displayName: "original" };
    const payload = buildFabricPayload([{ key: "displayName", targetPath: "displayName" }], { displayName: "new" }, base);
    expect(base.displayName).toBe("original");
    expect(payload.displayName).toBe("new");
  });
});

describe("mergeConfigurationModes", () => {
  it("returns basic/advanced values when there is no raw override", () => {
    expect(mergeConfigurationModes({ a: 1 })).toEqual({ a: 1 });
  });

  it("lets raw values win over basic/advanced", () => {
    expect(mergeConfigurationModes({ a: 1, b: 2 }, { b: 99 })).toEqual({ a: 1, b: 99 });
  });
});
