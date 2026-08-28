"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceStatusBadge, type ServiceStatusLevel } from "@/components/shared/service-status-badge";
import { fetchJson } from "@/components/shared/fetch-json";

interface OverviewResponse {
  customer: { companyName: string; status: string };
  latestDeployment: { id: string; status: string; startedAt: string | null; finishedAt: string | null } | null;
  serviceStatus: { area: string; label: string; status: ServiceStatusLevel; reason: string }[];
}

export function OverviewTab({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-overview", customerId],
    queryFn: () => fetchJson<OverviewResponse>(`/api/portal/${customerId}/overview`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Couldn&apos;t load your overview.</p>;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Latest deployment</CardTitle>
        </CardHeader>
        <CardContent>
          {data.latestDeployment ? (
            <p className="text-sm">
              Status <span className="font-medium">{data.latestDeployment.status}</span>
              {data.latestDeployment.finishedAt && ` — finished ${new Date(data.latestDeployment.finishedAt).toLocaleString()}`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No deployment has run yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.serviceStatus.map((entry) => (
          <Card key={entry.area}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium">{entry.label}</p>
                <p className="text-xs text-muted-foreground">{entry.reason}</p>
              </div>
              <ServiceStatusBadge status={entry.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
