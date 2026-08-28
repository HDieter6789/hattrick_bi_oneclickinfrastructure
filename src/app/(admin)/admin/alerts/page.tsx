"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { buildQueryString } from "@/components/admin-portal/query-params";
import { alertSeverityBadgeVariant, alertStatusBadgeVariant } from "@/components/admin-portal/badge-variants";
import { formatDateTime } from "@/components/admin-portal/format";
import { updateAdminAlertClientInput } from "@/components/admin-portal/schemas";
import { AlertSeverity, AlertStatus } from "@/generated/prisma/enums";
import type { AdminAlertListResult } from "@/features/admin-portal/alerts";

async function fetchAlerts(status: string, severity: string, customerId: string, page: number): Promise<AdminAlertListResult> {
  const qs = buildQueryString({
    status: status === "all" ? undefined : status,
    severity: severity === "all" ? undefined : severity,
    customerId,
    page,
    pageSize: 25,
  });
  return fetchJson<AdminAlertListResult>(`/api/admin/alerts${qs}`);
}

export default function AdminAlertsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [customerId, setCustomerId] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-alerts", status, severity, customerId, page],
    queryFn: () => fetchAlerts(status, severity, customerId, page),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status: newStatus }: { id: string; status: "acknowledged" | "resolved" }) => {
      const parsed = updateAdminAlertClientInput.parse({ status: newStatus });
      return fetchJson(`/api/admin/alerts/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(parsed) });
    },
    onSuccess: () => {
      toast.success("Alert updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">Operational alerts across every customer. Critical alerts always sort first.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.values(AlertStatus).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Severity</Label>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
            <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {Object.values(AlertSeverity).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Customer ID</Label>
          <Input value={customerId} onChange={(e) => { setCustomerId(e.target.value); setPage(1); }} placeholder="Filter by customer id" className="w-56" />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading alerts…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load alerts.</p>}

      {!isLoading && !isError && data && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.title}</TableCell>
                    <TableCell><Badge variant={alertSeverityBadgeVariant(alert.severity)}>{alert.severity}</Badge></TableCell>
                    <TableCell><Badge variant={alertStatusBadgeVariant(alert.status)}>{alert.status}</Badge></TableCell>
                    <TableCell>{alert.customerVisible && <Badge variant="secondary">Customer-visible</Badge>}</TableCell>
                    <TableCell>
                      {alert.customerId ? (
                        <Link href={`/admin/customers/${alert.customerId}`} className="font-mono text-xs hover:underline">{alert.customerId}</Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{formatDateTime(alert.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {alert.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: alert.id, status: "acknowledged" })}
                          >
                            Acknowledge
                          </Button>
                        )}
                        {alert.status !== "resolved" && (
                          <Button
                            size="sm"
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: alert.id, status: "resolved" })}
                          >
                            {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Resolve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.alerts.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No alerts match these filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {data.page} of {totalPages} ({data.total} alerts)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
