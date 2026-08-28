import type { DagEdge } from "@/features/provisioning/dag-types";

/**
 * Pure layered layout for the wizard Review step / deployment status DAG
 * viewer. `toFlowGraphProps` (features/provisioning/dag-types.ts) maps
 * resources to plain `{ nodes, edges }` but deliberately carries no x/y
 * position data — React Flow requires one. This assigns each node a column
 * equal to its longest-path depth from a root (a node with no incoming
 * edges), and stacks nodes within the same column vertically, so
 * dependencies always render left-to-right. Kept framework-free (no
 * `@xyflow/react` import) so it's trivially unit-testable.
 */

export interface DagPosition {
  x: number;
  y: number;
}

export const DAG_COLUMN_WIDTH = 260;
export const DAG_ROW_HEIGHT = 110;

/** Computes each node id's depth (0 = no incoming edges) via a longest-path
 * relaxation over the DAG. Assumes an acyclic graph — every caller here
 * consumes data the server already topologically validated
 * (services/provisioning/dag.ts), so no cycle guard is needed client-side. */
export function computeNodeDepths(nodeIds: string[], edges: DagEdge[]): Map<string, number> {
  const depths = new Map<string, number>();
  for (const id of nodeIds) depths.set(id, 0);

  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) incoming.set(id, []);
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge.source);
  }

  // Relax up to nodeIds.length times — enough passes for a longest path in
  // a DAG with no more than that many nodes on any chain.
  for (let pass = 0; pass < nodeIds.length; pass++) {
    let changed = false;
    for (const id of nodeIds) {
      const parents = incoming.get(id) ?? [];
      for (const parent of parents) {
        const candidate = (depths.get(parent) ?? 0) + 1;
        if (candidate > (depths.get(id) ?? 0)) {
          depths.set(id, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return depths;
}

/** Assigns an `{x, y}` pixel position per node id: column = depth, row =
 * index within that column (stable, insertion order). */
export function computeDagLayout(nodeIds: string[], edges: DagEdge[]): Map<string, DagPosition> {
  const depths = computeNodeDepths(nodeIds, edges);
  const columnCounts = new Map<number, number>();
  const positions = new Map<string, DagPosition>();

  for (const id of nodeIds) {
    const depth = depths.get(id) ?? 0;
    const row = columnCounts.get(depth) ?? 0;
    columnCounts.set(depth, row + 1);
    positions.set(id, { x: depth * DAG_COLUMN_WIDTH, y: row * DAG_ROW_HEIGHT });
  }

  return positions;
}
