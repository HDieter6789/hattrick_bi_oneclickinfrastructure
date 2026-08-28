"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, MarkerType, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FlowGraphProps } from "@/features/provisioning/dag-types";
import { computeDagLayout } from "./dag-layout";
import { layerAccentColor, resourceStatusStyle } from "./dag-status-color";

export interface DagViewProps<TStatus extends string = string> {
  graph: FlowGraphProps<TStatus>;
  /** When true (plan preview, no status yet), nodes are colored by
   * `layer` instead of `status`. */
  colorByLayer?: boolean;
  className?: string;
  heightClassName?: string;
}

/**
 * React Flow viewer shared by the wizard's Review step (plan preview) and
 * the live deployment status page (status-colored). Both callers build
 * `graph` via `toFlowGraphProps` (features/provisioning/dag-types.ts) — this
 * component only handles layout + presentation, never resource-specific
 * logic, keeping the "no Fabric item type hardcoded into a component" rule
 * intact for the DAG viewer too.
 */
export function DagView<TStatus extends string = string>({ graph, colorByLayer, className, heightClassName = "h-[420px]" }: DagViewProps<TStatus>) {
  const { nodes, edges } = useMemo(() => {
    const positions = computeDagLayout(
      graph.nodes.map((n) => n.id),
      graph.edges,
    );

    const flowNodes: Node[] = graph.nodes.map((n) => {
      const style = colorByLayer
        ? { background: "#ffffff", border: `2px solid ${layerAccentColor(n.layer)}`, color: "#1f2937" }
        : (() => {
            const s = resourceStatusStyle(n.status);
            return { background: s.background, border: `2px solid ${s.border}`, color: s.text };
          })();
      const position = positions.get(n.id) ?? { x: 0, y: 0 };
      const pulse = !colorByLayer && resourceStatusStyle(n.status).pulse;
      return {
        id: n.id,
        position,
        data: { label: n.label },
        className: pulse ? "animate-pulse" : undefined,
        style: { ...style, borderRadius: 8, padding: 8, fontSize: 12, minWidth: 160 },
      };
    });

    const flowEdges: Edge[] = graph.edges.map((e) => ({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#94a3b8" },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, colorByLayer]);

  return (
    <div className={className ?? `w-full ${heightClassName} rounded-lg border`}>
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable={false} nodesConnectable={false}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
