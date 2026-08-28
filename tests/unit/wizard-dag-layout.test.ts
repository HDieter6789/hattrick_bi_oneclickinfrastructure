import { describe, expect, it } from "vitest";
import { computeDagLayout, computeNodeDepths, DAG_COLUMN_WIDTH, DAG_ROW_HEIGHT } from "@/components/wizard/dag-layout";
import type { DagEdge } from "@/features/provisioning/dag-types";

describe("computeNodeDepths", () => {
  it("gives every root node (no incoming edges) depth 0", () => {
    const depths = computeNodeDepths(["a", "b"], []);
    expect(depths.get("a")).toBe(0);
    expect(depths.get("b")).toBe(0);
  });

  it("assigns depth = longest path length from any root", () => {
    // a -> b -> d, a -> c -> d : d's longest path is 2 (via either branch)
    const edges: DagEdge[] = [
      { source: "a", target: "b" },
      { source: "b", target: "d" },
      { source: "a", target: "c" },
      { source: "c", target: "d" },
    ];
    const depths = computeNodeDepths(["a", "b", "c", "d"], edges);
    expect(depths.get("a")).toBe(0);
    expect(depths.get("b")).toBe(1);
    expect(depths.get("c")).toBe(1);
    expect(depths.get("d")).toBe(2);
  });

  it("uses the longest incoming chain, not the shortest", () => {
    // a -> d directly, but also a -> b -> c -> d (longer chain wins)
    const edges: DagEdge[] = [
      { source: "a", target: "d" },
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
    ];
    const depths = computeNodeDepths(["a", "b", "c", "d"], edges);
    expect(depths.get("d")).toBe(3);
  });
});

describe("computeDagLayout", () => {
  it("places same-depth nodes in the same column at increasing y", () => {
    const edges: DagEdge[] = [
      { source: "root", target: "a" },
      { source: "root", target: "b" },
    ];
    const positions = computeDagLayout(["root", "a", "b"], edges);
    expect(positions.get("root")).toEqual({ x: 0, y: 0 });
    expect(positions.get("a")?.x).toBe(DAG_COLUMN_WIDTH);
    expect(positions.get("b")?.x).toBe(DAG_COLUMN_WIDTH);
    expect(new Set([positions.get("a")?.y, positions.get("b")?.y])).toEqual(new Set([0, DAG_ROW_HEIGHT]));
  });

  it("handles a graph with no edges (every node at column 0)", () => {
    const positions = computeDagLayout(["x", "y", "z"], []);
    expect(positions.get("x")).toEqual({ x: 0, y: 0 });
    expect(positions.get("y")).toEqual({ x: 0, y: DAG_ROW_HEIGHT });
    expect(positions.get("z")).toEqual({ x: 0, y: 2 * DAG_ROW_HEIGHT });
  });

  it("returns a position for every node id given", () => {
    const positions = computeDagLayout(["a", "b", "c"], [{ source: "a", target: "b" }]);
    expect(positions.size).toBe(3);
  });
});
