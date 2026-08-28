"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deploymentStatusBadgeVariant } from "@/components/admin-portal/badge-variants";
import { fetchJson } from "@/components/shared/fetch-json";
import { toFlowGraphProps } from "@/features/provisioning/dag-types";
import { DagView } from "@/components/wizard/dag-view";
import type { DeploymentStatus, DeploymentStepStatus, DesiredResourceStatus } from "@/generated/prisma/enums";

interface ApiDesiredResource {
  id: string;
  logicalName: string;
  displayName: string;
  type: string;
  dependsOn: string[];
  layer: string | null;
  status: DesiredResourceStatus;
}

interface ApiStep {
  id: string;
  stepKey: string;
  name: string;
  sequence: number;
  status: DeploymentStepStatus;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

interface ApiDeployment {
  id: string;
  status: DeploymentStatus;
  rollbackPolicy: string;
  startedAt: string | null;
  finishedAt: string | null;
  desiredResources: ApiDesiredResource[];
  steps: ApiStep[];
}

const TERMINAL_STATUSES: ReadonlySet<DeploymentStatus> = new Set(["succeeded", "failed", "cancelled", "rolled_back", "partially_failed"]);

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function DeploymentStatusView({ deploymentId }: { deploymentId: string }) {
  const queryClient = useQueryClient();
  const [rollbackResult, setRollbackResult] = useState<{ deleted: string[]; requiresManualReview: string[] } | null>(null);

  const deploymentQuery = useQuery({
    queryKey: ["deployment", deploymentId],
    queryFn: () => fetchJson<{ deployment: ApiDeployment }>(`/api/deployments/${deploymentId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.deployment.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 3000;
    },
  });

  const deployment = deploymentQuery.data?.deployment;

  const graph = useMemo(() => (deployment ? toFlowGraphProps(deployment.desiredResources) : null), [deployment]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["deployment", deploymentId] });
  }

  const startMutation = useMutation({
    mutationFn: () => fetchJson(`/api/deployments/${deploymentId}/start`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Deployment started.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => fetchJson(`/api/deployments/${deploymentId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Deployment cancelled.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => fetchJson<{ result: { deleted: string[]; requiresManualReview: string[] } }>(`/api/deployments/${deploymentId}/rollback`, { method: "POST" }),
    onSuccess: ({ result }) => {
      setRollbackResult(result);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (deploymentQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading deployment…</p>;
  if (deploymentQuery.isError || !deployment) return <p className="p-6 text-sm text-destructive">Couldn&apos;t load this deployment.</p>;

  const canStart = deployment.status === "draft" || deployment.status === "pending";
  const canCancel = deployment.status === "running";
  const canRollback = deployment.status === "failed" || deployment.status === "partially_failed" || deployment.status === "cancelled";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deployment</h1>
          <p className="text-sm text-muted-foreground">{deployment.id}</p>
        </div>
        <Badge variant={deploymentStatusBadgeVariant(deployment.status)} className="text-sm">
          {deployment.status}
        </Badge>
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!canStart || startMutation.isPending} onClick={() => startMutation.mutate()}>
          {startMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Start
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canCancel || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
          {cancelMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          Cancel
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canRollback || rollbackMutation.isPending} onClick={() => rollbackMutation.mutate()}>
          {rollbackMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          Rollback
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dependency graph</CardTitle>
          <CardDescription>Live resource status, colored by state.</CardDescription>
        </CardHeader>
        <CardContent>{graph && <DagView graph={graph} />}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...deployment.steps]
                .sort((a, b) => a.sequence - b.sequence)
                .map((step) => (
                  <TableRow key={step.id}>
                    <TableCell className="font-medium">{step.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{step.status}</Badge>
                    </TableCell>
                    <TableCell>{step.attempt}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTimestamp(step.startedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTimestamp(step.finishedAt)}</TableCell>
                    <TableCell className="max-w-xs truncate text-destructive">{step.errorMessage ?? "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={rollbackResult !== null} onOpenChange={(open) => !open && setRollbackResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback result</DialogTitle>
            <DialogDescription>What was deleted, and what needs manual review.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="font-medium">Deleted ({rollbackResult?.deleted.length ?? 0})</p>
              {rollbackResult?.deleted.length ? (
                <ul className="list-inside list-disc text-muted-foreground">
                  {rollbackResult.deleted.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None</p>
              )}
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-warning">
                <AlertTriangle className="size-3.5" />
                Requires manual review ({rollbackResult?.requiresManualReview.length ?? 0})
              </p>
              {rollbackResult?.requiresManualReview.length ? (
                <ul className="list-inside list-disc text-muted-foreground">
                  {rollbackResult.requiresManualReview.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None</p>
              )}
            </div>
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
