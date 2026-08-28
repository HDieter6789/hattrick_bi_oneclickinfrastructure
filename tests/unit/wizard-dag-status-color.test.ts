import { describe, expect, it } from "vitest";
import { layerAccentColor, resourceStatusStyle } from "@/components/wizard/dag-status-color";
import { DesiredResourceStatus } from "@/generated/prisma/enums";

describe("resourceStatusStyle", () => {
  it("returns a style for every DesiredResourceStatus", () => {
    for (const status of Object.values(DesiredResourceStatus)) {
      const style = resourceStatusStyle(status);
      expect(style.background).toBeTruthy();
      expect(style.border).toBeTruthy();
      expect(style.text).toBeTruthy();
    }
  });

  it("only pulses for running and rollback_pending", () => {
    expect(resourceStatusStyle("running").pulse).toBe(true);
    expect(resourceStatusStyle("rollback_pending").pulse).toBe(true);
    expect(resourceStatusStyle("succeeded").pulse).toBe(false);
    expect(resourceStatusStyle("failed").pulse).toBe(false);
    expect(resourceStatusStyle("pending").pulse).toBe(false);
  });

  it("falls back to a neutral default for undefined/unknown status", () => {
    expect(resourceStatusStyle(undefined)).toEqual(resourceStatusStyle(null));
    expect(resourceStatusStyle("not-a-real-status").pulse).toBe(false);
  });
});

describe("layerAccentColor", () => {
  it("returns a distinct color per known layer", () => {
    const colors = new Set([layerAccentColor("bronze"), layerAccentColor("silver"), layerAccentColor("gold")]);
    expect(colors.size).toBe(3);
  });

  it("falls back to a default accent for null/unknown layers", () => {
    expect(layerAccentColor(null)).toBe(layerAccentColor(undefined));
    expect(layerAccentColor("not-a-layer")).toBe(layerAccentColor(null));
  });
});
