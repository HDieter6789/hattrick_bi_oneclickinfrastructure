"use client";

import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/components/shared/fetch-json";

interface DatasetEntry {
  id: string;
  name: string;
  businessDescription: string | null;
  layer: string;
  lastUpdatedAt: string | null;
  refreshFrequency: string | null;
  availableViaSql: boolean;
  availableViaReport: boolean;
}

export function DataTab({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-datasets", customerId],
    queryFn: () => fetchJson<{ datasets: DatasetEntry[] }>(`/api/portal/${customerId}/datasets`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Couldn&apos;t load your datasets.</p>;
  if (data.datasets.length === 0) return <p className="text-sm text-muted-foreground">No datasets are available yet.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dataset</TableHead>
          <TableHead>Layer</TableHead>
          <TableHead>Last updated</TableHead>
          <TableHead>Refresh</TableHead>
          <TableHead>Access</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.datasets.map((dataset) => (
          <TableRow key={dataset.id}>
            <TableCell>
              <p className="font-medium">{dataset.name}</p>
              {dataset.businessDescription && <p className="text-xs text-muted-foreground">{dataset.businessDescription}</p>}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{dataset.layer}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{dataset.lastUpdatedAt ? new Date(dataset.lastUpdatedAt).toLocaleString() : "—"}</TableCell>
            <TableCell className="text-muted-foreground">{dataset.refreshFrequency ?? "—"}</TableCell>
            <TableCell className="flex gap-1">
              {dataset.availableViaSql && <Badge variant="outline">SQL</Badge>}
              {dataset.availableViaReport && <Badge variant="outline">Report</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
