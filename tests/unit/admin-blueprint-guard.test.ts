import { describe, expect, it } from "vitest";
import {
  assertBlueprintDeletable,
  BlueprintInUseError,
  SystemBlueprintNotDeletableError,
} from "@/features/admin-portal/pure/blueprint-guard";

describe("assertBlueprintDeletable", () => {
  it("allows deleting a non-system blueprint with no referencing configurations", () => {
    expect(() => assertBlueprintDeletable({ isSystem: false, referencingConfigurationCount: 0 })).not.toThrow();
  });

  it("blocks deleting a system blueprint even with zero referencing configurations", () => {
    expect(() => assertBlueprintDeletable({ isSystem: true, referencingConfigurationCount: 0 })).toThrow(
      SystemBlueprintNotDeletableError,
    );
  });

  it("blocks deleting a non-system blueprint still referenced by configurations", () => {
    expect(() => assertBlueprintDeletable({ isSystem: false, referencingConfigurationCount: 3 })).toThrow(BlueprintInUseError);
  });

  it("checks the isSystem guard before the in-use guard", () => {
    // A system blueprint that's also in use should still surface as the
    // system-blueprint error, since that's the more fundamental rule.
    expect(() => assertBlueprintDeletable({ isSystem: true, referencingConfigurationCount: 5 })).toThrow(
      SystemBlueprintNotDeletableError,
    );
  });
});
