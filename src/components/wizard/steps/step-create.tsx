"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RollbackPolicy } from "@/generated/prisma/enums";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";

interface ApiAppointment {
  id: string;
  status: string;
}

interface ApiDeployment {
  id: string;
}

const ROLLBACK_POLICY_LABELS: Record<string, string> = {
  KEEP_SUCCESSFUL_RESOURCES: "Keep successful resources on failure",
  ROLLBACK_CREATED_RESOURCES: "Roll back created resources on failure",
};

export function StepCreate({ data, update, goBack }: WizardStepProps) {
  const router = useRouter();
  const [rollbackPolicy, setRollbackPolicy] = useState(data.rollbackPolicy);

  // Re-checked live (not just from wizard state) immediately before
  // enabling the button — the appointment gate is ultimately enforced
  // server-side (services/provisioning/preflight.ts), but the button itself
  // must never be enabled client-side on stale data either.
  const appointmentQuery = useQuery({
    queryKey: ["wizard-appointments", data.customerId],
    queryFn: () => fetchJson<{ appointments: ApiAppointment[] }>(`/api/appointments?customerId=${encodeURIComponent(data.customerId!)}`),
    enabled: Boolean(data.customerId),
    refetchInterval: 5000,
  });

  const confirmedAppointment = appointmentQuery.data?.appointments.find((a) => a.id === data.appointmentId && a.status === "confirmed");
  const canCreate = Boolean(data.configurationId && data.appointmentId && confirmedAppointment);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!data.configurationId || !data.appointmentId) throw new Error("Missing configuration or appointment");
      const { deployment } = await fetchJson<{ deployment: ApiDeployment }>("/api/deployments", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ infrastructureConfigurationId: data.configurationId, appointmentId: data.appointmentId, rollbackPolicy }),
      });
      await fetchJson(`/api/deployments/${deployment.id}/start`, { method: "POST" });
      return deployment;
    },
    onSuccess: (deployment) => {
      toast.success("Deployment started.");
      router.push(`/admin/deployments/${deployment.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create</CardTitle>
        <CardDescription>Everything is configured — start provisioning this customer&apos;s infrastructure.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 max-w-sm">
          <Label>Rollback policy</Label>
          <Select
            value={rollbackPolicy}
            onValueChange={(v) => {
              const next = v as (typeof RollbackPolicy)[keyof typeof RollbackPolicy];
              setRollbackPolicy(next);
              update({ rollbackPolicy: next });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RollbackPolicy).map((policy) => (
                <SelectItem key={policy} value={policy}>
                  {ROLLBACK_POLICY_LABELS[policy] ?? policy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!canCreate && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>The onboarding appointment must be confirmed before infrastructure can be created.</span>
          </div>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack} disabled={createMutation.isPending}>
            Back
          </Button>
          <Button type="button" size="lg" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Create infrastructure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
