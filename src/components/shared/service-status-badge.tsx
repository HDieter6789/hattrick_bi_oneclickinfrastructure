import { cn } from "@/lib/utils";

export type ServiceStatusLevel = "GREEN" | "YELLOW" | "RED";

const STYLES: Record<ServiceStatusLevel, string> = {
  GREEN: "bg-success/10 text-success border-success/25",
  YELLOW: "bg-warning/10 text-warning border-warning/25",
  RED: "bg-destructive/10 text-destructive border-destructive/25",
};

const LABELS: Record<ServiceStatusLevel, string> = {
  GREEN: "Operational",
  YELLOW: "Degraded",
  RED: "Incident",
};

export function ServiceStatusBadge({ status, className }: { status: ServiceStatusLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", status === "GREEN" ? "bg-success" : status === "YELLOW" ? "bg-warning" : "bg-destructive")} />
      {LABELS[status]}
    </span>
  );
}
