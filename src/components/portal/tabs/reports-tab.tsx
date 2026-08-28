"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/components/shared/fetch-json";

interface DatasetEntry {
  id: string;
  name: string;
  availableViaReport: boolean;
}

/**
 * No dedicated `GET /api/portal/[customerId]/reports` route exists (see the
 * implementation report's flagged gaps) — this reuses the dataset catalog,
 * filtered to `availableViaReport`, as the best available customer-safe
 * signal for "what reporting is live", alongside the semantic
 * model/starter report flags this tab is only shown for in the first place.
 */
export function ReportsTab({ customerId, semanticModelEnabled, starterReportEnabled }: { customerId: string; semanticModelEnabled: boolean; starterReportEnabled: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-datasets", customerId],
    queryFn: () => fetchJson<{ datasets: DatasetEntry[] }>(`/api/portal/${customerId}/datasets`),
  });

  const reportable = data?.datasets.filter((d) => d.availableViaReport) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Enabled features</CardTitle>
          <CardDescription>What&apos;s been enabled for this platform.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {starterReportEnabled && <Badge variant="secondary">Starter report</Badge>}
          {semanticModelEnabled && <Badge variant="secondary">Semantic model</Badge>}
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Couldn&apos;t load report-backed datasets.</p>}
      {!isLoading && !isError && reportable.length === 0 && (
        <p className="text-sm text-muted-foreground">No datasets are exposed via a report yet.</p>
      )}
      {reportable.length > 0 && (
        <ul className="flex flex-col gap-2">
          {reportable.map((d) => (
            <li key={d.id} className="rounded-lg border p-3 text-sm">
              {d.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
