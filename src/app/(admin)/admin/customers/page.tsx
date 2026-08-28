"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/components/admin-portal/api";
import { buildQueryString } from "@/components/admin-portal/query-params";
import { customerStatusBadgeVariant } from "@/components/admin-portal/badge-variants";
import { formatDate } from "@/components/admin-portal/format";
import { CustomerStatus } from "@/generated/prisma/enums";
import type { AdminCustomerListResult } from "@/features/admin-portal/customers";

async function fetchCustomers(status: string, search: string, page: number): Promise<AdminCustomerListResult> {
  const qs = buildQueryString({ status: status === "all" ? undefined : status, search, page, pageSize: 25 });
  return fetchJson<AdminCustomerListResult>(`/api/admin/customers${qs}`);
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  configuration: "Configuration",
  ready_for_deployment: "Ready for deployment",
  deploying: "Deploying",
  active: "Active",
  error: "Error",
  suspended: "Suspended",
};

export default function AdminCustomersPage() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-customers", status, search, page],
    queryFn: () => fetchCustomers(status, search, page),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">Every provisioned or in-progress customer account.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.values(CustomerStatus).map((s) => (<SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Company or contact email" className="w-64" />
          </div>
          <Button type="submit" size="sm" variant="outline">Search</Button>
        </form>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading customers…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load customers.</p>}

      {!isLoading && !isError && data && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Service tier</TableHead>
                  <TableHead>Environment mode</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Latest deployment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link href={`/admin/customers/${customer.id}`} className="hover:underline">{customer.companyName}</Link>
                    </TableCell>
                    <TableCell><Badge variant={customerStatusBadgeVariant(customer.status)}>{STATUS_LABELS[customer.status]}</Badge></TableCell>
                    <TableCell>{customer.serviceTier}</TableCell>
                    <TableCell>{customer.environmentMode}</TableCell>
                    <TableCell>{formatDate(customer.createdAt)}</TableCell>
                    <TableCell>{customer.latestDeployment ? customer.latestDeployment.status : "—"}</TableCell>
                  </TableRow>
                ))}
                {data.customers.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No customers match these filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {data.page} of {totalPages} ({data.total} customers)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
