import { describe, expect, it } from "vitest";
import {
  CircularDependencyError,
  UnknownDependencyError,
  hasCircularDependency,
  toEdgeList,
  topologicalSort,
} from "@/services/provisioning/dag";

describe("topologicalSort", () => {
  it("orders a simple chain correctly", () => {
    const order = topologicalSort([
      { logicalName: "gold", dependsOn: ["silver"] },
      { logicalName: "silver", dependsOn: ["bronze"] },
      { logicalName: "bronze", dependsOn: [] },
    ]);
    expect(order).toEqual(["bronze", "silver", "gold"]);
  });

  it("orders the full medallion -> report chain from the brief", () => {
    const order = topologicalSort([
      { logicalName: "source", dependsOn: [] },
      { logicalName: "pipeline", dependsOn: ["source"] },
      { logicalName: "bronze", dependsOn: ["pipeline"] },
      { logicalName: "transform", dependsOn: ["bronze"] },
      { logicalName: "silver", dependsOn: ["transform"] },
      { logicalName: "gold", dependsOn: ["silver"] },
      { logicalName: "semantic_model", dependsOn: ["gold"] },
      { logicalName: "report", dependsOn: ["semantic_model"] },
    ]);
    expect(order).toEqual([
      "source",
      "pipeline",
      "bronze",
      "transform",
      "silver",
      "gold",
      "semantic_model",
      "report",
    ]);
  });

  it("is deterministic for independent nodes (alphabetical tie-break)", () => {
    const order = topologicalSort([
      { logicalName: "zeta", dependsOn: [] },
      { logicalName: "alpha", dependsOn: [] },
      { logicalName: "middle", dependsOn: ["zeta", "alpha"] },
    ]);
    expect(order).toEqual(["alpha", "zeta", "middle"]);
  });

  it("throws CircularDependencyError for a direct cycle", () => {
    expect(() =>
      topologicalSort([
        { logicalName: "a", dependsOn: ["b"] },
        { logicalName: "b", dependsOn: ["a"] },
      ]),
    ).toThrow(CircularDependencyError);
  });

  it("throws CircularDependencyError for a longer cycle", () => {
    expect(() =>
      topologicalSort([
        { logicalName: "a", dependsOn: ["b"] },
        { logicalName: "b", dependsOn: ["c"] },
        { logicalName: "c", dependsOn: ["a"] },
      ]),
    ).toThrow(CircularDependencyError);
  });

  it("throws UnknownDependencyError when a dependency does not exist", () => {
    expect(() => topologicalSort([{ logicalName: "a", dependsOn: ["ghost"] }])).toThrow(UnknownDependencyError);
  });

  it("handles a resource with no dependencies alongside a chain", () => {
    const order = topologicalSort([
      { logicalName: "standalone", dependsOn: [] },
      { logicalName: "b", dependsOn: ["a"] },
      { logicalName: "a", dependsOn: [] },
    ]);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order).toContain("standalone");
  });
});

describe("hasCircularDependency", () => {
  it("returns false for an acyclic graph", () => {
    expect(hasCircularDependency([{ logicalName: "a", dependsOn: [] }, { logicalName: "b", dependsOn: ["a"] }])).toBe(
      false,
    );
  });

  it("returns true for a cyclic graph", () => {
    expect(
      hasCircularDependency([
        { logicalName: "a", dependsOn: ["b"] },
        { logicalName: "b", dependsOn: ["a"] },
      ]),
    ).toBe(true);
  });
});

describe("toEdgeList", () => {
  it("flattens dependsOn into source/target edges", () => {
    const edges = toEdgeList([
      { logicalName: "gold", dependsOn: ["silver"] },
      { logicalName: "silver", dependsOn: ["bronze"] },
      { logicalName: "bronze", dependsOn: [] },
    ]);
    expect(edges).toEqual([
      { source: "silver", target: "gold" },
      { source: "bronze", target: "silver" },
    ]);
  });
});
