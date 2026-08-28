"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { updateCustomerStatusClientInput, type UpdateCustomerStatusClientInput } from "@/components/admin-portal/schemas";
import { customerStatusBadgeVariant, alertSeverityBadgeVariant, connectionHealthBadgeVariant, connectionStatusBadgeVariant, deploymentStatusBadgeVariant, alertStatusBadgeVariant } from "@/components/admin-portal/badge-variants";
import { formatDate, formatDateTime } from "@/components/admin-portal/format";
import { canTransitionCustomerStatus, type CustomerStatusLiteral } from "@/features/admin-portal/pure/customer-status";
import { CustomerStatus } from "@/generated/prisma/enums";

/** Mirrors getAdminCustomerDetail's `select` clauses
 * (features/admin-portal/customers.ts) field-for-field — that function has
 * no named return type to import (Prisma infers it inline), so the shape
 * is reproduced here from the actual `select`, with every timestamp typed
 * as the `string` it arrives as once JSON-serialized. */
interface AdminCustomerDetail {
  id: string;
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string | null;
  tenantId: string | null;
  domain: string | null;
  environmentMode: string;
  serviceTier: string;
  status: CustomerStatusLiteral;
  createdAt: string;
  updatedAt: string;
  configurations: { id: string; name: string; architecture: string; status: string; currentVersion: number; createdAt: string; updatedAt: string }[];
  connections: {
    id: string;
    displayName: string;
    connectorTypeKey: string;
    authMethod: string;
    status: "draft" | "authenticating" | "connected" | "error" | "disabled";
    health: "unknown" | "healthy" | "degraded" | "failed";
    connectedAt: string | null;
    lastValidationAt: string | null;
    createdAt: string;
  }[];
  deployments: {
    id: string;
    status: "draft" | "pending" | "running" | "partially_failed" | "failed" | "succeeded" | "cancelled" | "rolled_back";
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
  }[];
  appointments: { id: string; status: string; startTime: string; endTime: string; serviceAgentId: string | null }[];
  accessGrants: { id: string; kind: string; principalType: string; groupName: string | null; fabricRole: string | null; status: string; grantedAt: string | null }[];
  alerts: {
    id: string;
    sourceEvent: string;
    severity: "info" | "warning" | "critical";
    status: "open" | "acknowledged" | "resolved";
    title: string;
    customerVisible: boolean;
    createdAt: string;
  }[];
}

interface CustomerDetailResponse {
  customer: AdminCustomerDetail;
}

async function fetchCustomerDetail(id: string): Promise<AdminCustomerDetail> {
  const body = await fetchJson<CustomerDetailResponse>(`/api/admin/customers/${id}`);
  return body.customer;
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

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">{label}</TableCell>
    </TableRow>
  );
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [pendingStatus, setPendingStatus] = useState<string>("");

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => fetchCustomerDetail(id),
  });

  const statusMutation = useMutation({
    mutationFn: (input: UpdateCustomerStatusClientInput) =>
      fetchJson<{ customer: unknown }>(`/api/admin/customers/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Customer status updated.");
      setPendingStatus("");
      queryClient.invalidateQueries({ queryKey: ["admin-customer", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !customer) return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-destructive">Customer not found.</div>;

  const allowedTargets = Object.values(CustomerStatus).filter((s) => canTransitionCustomerStatus(customer.status, s));

  function handleTransition() {
    const parsed = updateCustomerStatusClientInput.safeParse({ status: pendingStatus });
    if (!parsed.success) return;
    statusMutation.mutate(parsed.data);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to customers
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            {customer.contactFirstName} {customer.contactLastName} · {customer.contactEmail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={customerStatusBadgeVariant(customer.status)}>{STATUS_LABELS[customer.status]}</Badge>
          {allowedTargets.length > 0 && (
            <>
              <Select value={pendingStatus} onValueChange={setPendingStatus}>
                <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Change status…" /></SelectTrigger>
                <SelectContent>
                  {allowedTargets.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!pendingStatus || statusMutation.isPending} onClick={handleTransition}>
                {statusMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Apply
              </Button>
            </>
          )}
        </div>
      </div>

      <Section title="Profile">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-3">
          <Field label="Service tier" value={customer.serviceTier} />
          <Field label="Environment mode" value={customer.environmentMode} />
          <Field label="Tenant" value={customer.tenantId ?? "—"} />
          <Field label="Domain" value={customer.domain ?? "—"} />
          <Field label="Contact phone" value={customer.contactPhone ?? "—"} />
          <Field label="Created" value={formatDateTime(customer.createdAt)} />
        </div>
      </Section>

      <Section title="Configurations">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Architecture</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
          <TableBody>
            {customer.configurations.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell><Badge variant="outline">{c.architecture}</Badge></TableCell>
                <TableCell>{c.status}</TableCell>
                <TableCell>{c.currentVersion}</TableCell>
                <TableCell>{formatDate(c.updatedAt)}</TableCell>
              </TableRow>
            ))}
            {customer.configurations.length === 0 && <EmptyRow colSpan={5} label="No configurations yet." />}
          </TableBody>
        </Table>
      </Section>

      <Section title="Connections" description="Status and health only — credentials are never exposed here.">
        <Table>
          <TableHeader><TableRow><TableHead>Display name</TableHead><TableHead>Connector</TableHead><TableHead>Status</TableHead><TableHead>Health</TableHead><TableHead>Last validated</TableHead></TableRow></TableHeader>
          <TableBody>
            {customer.connections.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.displayName}</TableCell>
                <TableCell className="font-mono text-xs">{c.connectorTypeKey}</TableCell>
                <TableCell><Badge variant={connectionStatusBadgeVariant(c.status)}>{c.status}</Badge></TableCell>
                <TableCell><Badge variant={connectionHealthBadgeVariant(c.health)}>{c.health}</Badge></TableCell>
                <TableCell>{formatDateTime(c.lastValidationAt)}</TableCell>
              </TableRow>
            ))}
            {customer.connections.length === 0 && <EmptyRow colSpan={5} label="No connections yet." />}
          </TableBody>
        </Table>
      </Section>

      <Section title="Deployments">
        <Table>
          <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Finished</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>
            {customer.deployments.map((d) => (
              <TableRow key={d.id}>
                <TableCell><Badge variant={deploymentStatusBadgeVariant(d.status)}>{d.status}</Badge></TableCell>
                <TableCell>{formatDateTime(d.startedAt)}</TableCell>
                <TableCell>{formatDateTime(d.finishedAt)}</TableCell>
                <TableCell>{formatDate(d.createdAt)}</TableCell>
              </TableRow>
            ))}
            {customer.deployments.length === 0 && <EmptyRow colSpan={4} label="No deployments yet." />}
          </TableBody>
        </Table>
      </Section>

      <Section title="Appointments">
        <Table>
          <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Service agent</TableHead></TableRow></TableHeader>
          <TableBody>
            {customer.appointments.map((a) => (
              <TableRow key={a.id}>
                <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                <TableCell>{formatDateTime(a.startTime)}</TableCell>
                <TableCell>{formatDateTime(a.endTime)}</TableCell>
                <TableCell className="font-mono text-xs">{a.serviceAgentId ?? "—"}</TableCell>
              </TableRow>
            ))}
            {customer.appointments.length === 0 && <EmptyRow colSpan={4} label="No appointments yet." />}
          </TableBody>
        </Table>
      </Section>

      <Section title="Access grants">
        <Table>
          <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Principal type</TableHead><TableHead>Group</TableHead><TableHead>Fabric role</TableHead><TableHead>Status</TableHead><TableHead>Granted</TableHead></TableRow></TableHeader>
          <TableBody>
            {customer.accessGrants.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{g.kind}</TableCell>
                <TableCell>{g.principalType}</TableCell>
                <TableCell>{g.groupName ?? "—"}</TableCell>
                <TableCell>{g.fabricRole ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{g.status}</Badge></TableCell>
                <TableCell>{formatDateTime(g.grantedAt)}</TableCell>
              </TableRow>
            ))}
            {customer.accessGrants.length === 0 && <EmptyRow colSpan={6} label="No access grants yet." />}
          </TableBody>
        </Table>
      </Section>

      <Section title="Alerts" description="Most recent 25. A blue-tinted “Customer-visible” badge marks alerts also surfaced in the customer portal.">
        <Table>
          <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Visibility</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>
            {customer.alerts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.title}</TableCell>
                <TableCell><Badge variant={alertSeverityBadgeVariant(a.severity)}>{a.severity}</Badge></TableCell>
                <TableCell><Badge variant={alertStatusBadgeVariant(a.status)}>{a.status}</Badge></TableCell>
                <TableCell>{a.customerVisible && <Badge variant="secondary">Customer-visible</Badge>}</TableCell>
                <TableCell>{formatDateTime(a.createdAt)}</TableCell>
              </TableRow>
            ))}
            {customer.alerts.length === 0 && <EmptyRow colSpan={5} label="No alerts yet." />}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
