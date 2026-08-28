"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/components/shared/fetch-json";
import { toFlowGraphProps } from "@/features/provisioning/dag-types";
import { DagView } from "@/components/wizard/dag-view";
import type { WizardStepProps } from "@/components/wizard/types";

interface PlannedResource {
  logicalName: string;
  type: string;
  displayName: string;
  dependsOn: string[];
  layer?: string | null;
  configuration: Record<string, unknown>;
}

interface DeploymentPlan {
  resources: PlannedResource[];
  order: string[];
  summary: { total: number; byType: Record<string, number> };
}

export function StepReview({ data, goNext, goBack }: WizardStepProps) {
  const [plan, setPlan] = useState<DeploymentPlan | null>(null);

  const planMutation = useMutation({
    mutationFn: async () => {
      await fetchJson(`/api/configurations/${data.configurationId}/finalize`, { method: "POST" });
      const { plan } = await fetchJson<{ plan: DeploymentPlan }>(`/api/configurations/${data.configurationId}/plan`, { method: "POST" });
      return plan;
    },
    onSuccess: (plan) => setPlan(plan),
    onError: (error: Error) => toast.error(error.message),
  });

  const graph = plan ? toFlowGraphProps(plan.resources) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription>Finalize the configuration and generate the deployment plan before creating infrastructure.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!plan && (
          <Button type="button" onClick={() => planMutation.mutate()} disabled={planMutation.isPending}>
            {planMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Finalize &amp; generate plan
          </Button>
        )}

        {plan && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {plan.summary.total} resources planned across {Object.keys(plan.summary.byType).length} types.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => planMutation.mutate()} disabled={planMutation.isPending}>
                {planMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Regenerate
              </Button>
            </div>

            {graph && <DagView graph={graph} colorByLayer />}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Logical name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Layer</TableHead>
                  <TableHead>Depends on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.order.map((logicalName) => {
                  const resource = plan.resources.find((r) => r.logicalName === logicalName);
                  if (!resource) return null;
                  return (
                    <TableRow key={logicalName}>
                      <TableCell className="font-medium">{resource.displayName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{resource.type}</Badge>
                      </TableCell>
                      <TableCell>{resource.layer ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {resource.dependsOn.length > 0 ? resource.dependsOn.join(", ") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" disabled={!plan} onClick={goNext}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
