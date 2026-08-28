/**
 * Client-safe DAG shapes for the wizard's Review step and the deployment
 * status page. Deliberately duplicated (not imported) from
 * services/provisioning/dag.ts: that file lives under
 * src/services/provisioning/** which this feature is only allowed to CALL
 * from server code, never import into a "use client" component. The shapes
 * (`DagNodeLike`/`DagEdge`) and `toEdgeList`'s behavior are simple and
 * stable enough to mirror exactly; tests/unit/plan-dag-mapping.test.ts
 * pins the behavior this file and dag.ts must keep agreeing on.
 */

export interface DagNodeLike {
  logicalName: string;
  dependsOn: string[];
}

export interface DagEdge {
  source: string;
  target: string;
}

/** Flattens dependsOn[] into a simple edge list — mirrors
 * services/provisioning/dag.ts's toEdgeList exactly. */
export function toEdgeList(nodes: DagNodeLike[]): DagEdge[] {
  return nodes.flatMap((node) => node.dependsOn.map((dep) => ({ source: dep, target: node.logicalName })));
}

/** Node/edge props shaped for a React Flow graph, colored by a caller-
 * supplied status. Kept generic over the status type so it works for both
 * `PlannedResource[]` (no status yet, plan preview) and
 * `DesiredResource[]` (has `DesiredResourceStatus`) callers. */
export interface FlowGraphNode<TStatus extends string = string> {
  id: string;
  label: string;
  status?: TStatus;
  layer?: string | null;
}

export interface FlowGraphProps<TStatus extends string = string> {
  nodes: FlowGraphNode<TStatus>[];
  edges: DagEdge[];
}

/** Maps any `{ logicalName, dependsOn, ... }[]` collection to the props a
 * React Flow viewer needs, without pulling in @xyflow/react's own node/edge
 * types here (kept to plain data so it's trivially unit-testable). */
export function toFlowGraphProps<T extends DagNodeLike & { status?: TStatus; displayName?: string; layer?: string | null }, TStatus extends string = string>(
  resources: T[],
): FlowGraphProps<TStatus> {
  return {
    nodes: resources.map((r) => ({
      id: r.logicalName,
      label: r.displayName ?? r.logicalName,
      status: r.status,
      layer: r.layer ?? null,
    })),
    edges: toEdgeList(resources),
  };
}
