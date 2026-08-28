"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/components/shared/fetch-json";

interface SqlAccessEntry {
  id: string;
  provisioningStatus: string;
  readOnly: boolean;
  summary: {
    server: string;
    database: string;
    authMethod: string;
    readOnlyNotice: string;
    exampleQuery: string;
  };
}

export function SqlTab({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-sql-access", customerId],
    queryFn: () => fetchJson<{ sqlAccess: SqlAccessEntry[] }>(`/api/portal/${customerId}/sql-access`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Couldn&apos;t load SQL access.</p>;
  if (data.sqlAccess.length === 0) return <p className="text-sm text-muted-foreground">No SQL endpoint has been provisioned yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      {data.sqlAccess.map((endpoint) => (
        <Card key={endpoint.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{endpoint.summary.server}</CardTitle>
              <div className="flex gap-1.5">
                <Badge variant="outline">{endpoint.provisioningStatus}</Badge>
                {endpoint.readOnly && <Badge variant="secondary">Read-only</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Database</p>
              <p>{endpoint.summary.database}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Authentication</p>
              <p>{endpoint.summary.authMethod}</p>
            </div>
            <p className="text-xs text-muted-foreground">{endpoint.summary.readOnlyNotice}</p>
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">{endpoint.summary.exampleQuery}</pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
