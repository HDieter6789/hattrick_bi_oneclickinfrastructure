/**
 * Pure status/layer -> color mappings for the DAG viewer, shared by the
 * wizard's Review step (plan preview, colored by `layer` since
 * `PlannedResource` has no status yet) and the live deployment status page
 * (colored by `DesiredResourceStatus`). Kept as plain data (no React/xyflow
 * imports) so it's trivially unit-testable and reusable from both callers.
 */

export interface DagNodeStyle {
  background: string;
  border: string;
  text: string;
  /** True for the one status that should visually pulse/animate (running). */
  pulse: boolean;
}

const DEFAULT_STYLE: DagNodeStyle = { background: "#f1f5f9", border: "#94a3b8", text: "#334155", pulse: false };

const STATUS_STYLES: Record<string, DagNodeStyle> = {
  pending: { background: "#f1f5f9", border: "#94a3b8", text: "#334155", pulse: false },
  validating: { background: "#eff6ff", border: "#60a5fa", text: "#1d4ed8", pulse: false },
  ready: { background: "#eff6ff", border: "#60a5fa", text: "#1d4ed8", pulse: false },
  running: { background: "#dbeafe", border: "#3b82f6", text: "#1e40af", pulse: true },
  succeeded: { background: "#dcfce7", border: "#22c55e", text: "#15803d", pulse: false },
  failed: { background: "#fee2e2", border: "#ef4444", text: "#b91c1c", pulse: false },
  skipped: { background: "#fef3c7", border: "#f59e0b", text: "#b45309", pulse: false },
  rollback_pending: { background: "#fef3c7", border: "#f59e0b", text: "#b45309", pulse: true },
  rolled_back: { background: "#f1f5f9", border: "#94a3b8", text: "#334155", pulse: false },
};

/** Maps a `DesiredResourceStatus` (or `undefined`, for a plan preview node
 * that has no status yet) to the style its DAG node should render with. */
export function resourceStatusStyle(status?: string | null): DagNodeStyle {
  if (!status) return DEFAULT_STYLE;
  return STATUS_STYLES[status] ?? DEFAULT_STYLE;
}

const LAYER_COLORS: Record<string, string> = {
  bronze: "#92400e",
  silver: "#475569",
  gold: "#a16207",
};

/** Maps a blueprint resource `layer` ("bronze"/"silver"/"gold"/null) to an
 * accent color for the plan-preview DAG, which has no per-node status yet. */
export function layerAccentColor(layer?: string | null): string {
  if (!layer) return "#6366f1";
  return LAYER_COLORS[layer] ?? "#6366f1";
}
