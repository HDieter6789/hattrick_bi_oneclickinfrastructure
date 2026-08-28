"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/components/shared/fetch-json";
import type { CustomerUsageSnapshot } from "@/services/monitoring/types";

export function UsageTab({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-usage", customerId],
    queryFn: () => fetchJson<{ usage: CustomerUsageSnapshot }>(`/api/portal/${customerId}/usage`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Couldn&apos;t load usage.</p>;

  const { usage } = data;
  if (!usage.enabled) return <p className="text-sm text-muted-foreground">Usage reporting isn&apos;t enabled for this platform.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Datasets" value={usage.datasetCount} />
        <StatCard label="Successful runs" value={usage.jobCounts.succeeded} />
        <StatCard label="Failed runs" value={usage.jobCounts.failed} />
        <StatCard label="Last successful load" value={usage.lastSuccessfulLoad ? new Date(usage.lastSuccessfulLoad).toLocaleDateString() : "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Refresh history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {usage.refreshHistory.length === 0 && <p className="text-sm text-muted-foreground">No refresh history yet.</p>}
          {usage.refreshHistory.map((entry) => (
            <div key={`${entry.deploymentId}-${entry.stepKey}`} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
              <span>{entry.name}</span>
              <span className="text-muted-foreground">{entry.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {usage.advancedTechnical && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Advanced technical metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Resources provisioned</p>
              <p className="font-medium">{usage.advancedTechnical.totalResourcesProvisioned}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Deployments</p>
              <p className="font-medium">{usage.advancedTechnical.totalDeployments}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Avg. step attempts</p>
              <p className="font-medium">{usage.advancedTechnical.averageStepAttempts.toFixed(1)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
