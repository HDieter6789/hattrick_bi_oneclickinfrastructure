"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/components/admin-portal/api";
import { buildQueryString } from "@/components/admin-portal/query-params";
import { auditStatusBadgeVariant } from "@/components/admin-portal/badge-variants";
import { formatDateTime } from "@/components/admin-portal/format";

/** One AuditLog row as returned by GET /api/admin/audit-log, joined with
 * user/customer per listAdminAuditLog's `include` (features/admin-portal/audit-log.ts). */
interface AdminAuditLogEntry {
  id: string;
  userId: string | null;
  customerId: string | null;
  deploymentId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  status: "success" | "failure";
  correlationId: string | null;
  metadata: unknown;
  createdAt: string;
  user: { name: string | null; email: string } | null;
  customer: { companyName: string } | null;
}

interface AdminAuditLogResult {
  entries: AdminAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditLogFilters {
  userId: string;
  customerId: string;
  deploymentId: string;
  action: string;
  status: string;
  from: string;
  to: string;
}

function emptyFilters(): AuditLogFilters {
  return { userId: "", customerId: "", deploymentId: "", action: "", status: "all", from: "", to: "" };
}

async function fetchAuditLog(filters: AuditLogFilters, page: number): Promise<AdminAuditLogResult> {
  const qs = buildQueryString({
    userId: filters.userId,
    customerId: filters.customerId,
    deploymentId: filters.deploymentId,
    action: filters.action,
    status: filters.status === "all" ? undefined : filters.status,
    from: filters.from,
    to: filters.to,
    page,
    pageSize: 50,
  });
  return fetchJson<AdminAuditLogResult>(`/api/admin/audit-log${qs}`);
}

export default function AdminAuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>(emptyFilters());
  const [applied, setApplied] = useState<AuditLogFilters>(emptyFilters());
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-audit-log", applied, page],
    queryFn: () => fetchAuditLog(applied, page),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setApplied(filters);
    setPage(1);
  }

  function handleReset() {
    setFilters(emptyFilters());
    setApplied(emptyFilters());
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Append-only record of every admin and system-driven mutation.</p>
      </div>

      <form onSubmit={handleApply} className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">User ID</Label>
          <Input value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Customer ID</Label>
          <Input value={filters.customerId} onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Deployment ID</Label>
          <Input value={filters.deploymentId} onChange={(e) => setFilters((f) => ({ ...f, deploymentId: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Input value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} placeholder="blueprint.update" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">Apply filters</Button>
          <Button type="button" variant="outline" size="sm" onClick={handleReset}>Reset</Button>
        </div>
      </form>

      {isLoading && <p className="text-sm text-muted-foreground">Loading audit log…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load the audit log.</p>}

      {!isLoading && !isError && data && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>{entry.user?.name ?? entry.user?.email ?? "System"}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.resourceType ? `${entry.resourceType}${entry.resourceId ? `:${entry.resourceId}` : ""}` : "—"}</TableCell>
                    <TableCell>
                      {entry.customerId ? (
                        <Link href={`/admin/customers/${entry.customerId}`} className="hover:underline">{entry.customer?.companyName ?? entry.customerId}</Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell><Badge variant={auditStatusBadgeVariant(entry.status)}>{entry.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {data.entries.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No audit entries match these filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {data.page} of {totalPages} ({data.total} entries)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
