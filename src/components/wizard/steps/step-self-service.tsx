"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";

interface ConfigurationFlags {
  sqlSelfServiceEnabled: boolean;
  sqlSelfServiceTargetLayer: string;
  semanticModelEnabled: boolean;
  starterReportEnabled: boolean;
}

const DEFAULT_FLAGS: ConfigurationFlags = {
  sqlSelfServiceEnabled: false,
  sqlSelfServiceTargetLayer: "gold",
  semanticModelEnabled: false,
  starterReportEnabled: false,
};

export function StepSelfService({ data, goNext, goBack }: WizardStepProps) {
  const configQuery = useQuery({
    queryKey: ["wizard-configuration", data.configurationId],
    queryFn: () => fetchJson<{ configuration: ConfigurationFlags }>(`/api/configurations/${data.configurationId}`),
    enabled: Boolean(data.configurationId),
  });

  // Local edits layered on top of the fetched configuration, rather than
  // copying query data into state via an effect (which cascades an extra
  // render and trips react-hooks/set-state-in-effect) — the merged object
  // below is always in sync with the latest fetch without needing one.
  const [overrides, setOverrides] = useState<Partial<ConfigurationFlags>>({});
  const flags: ConfigurationFlags = { ...DEFAULT_FLAGS, ...configQuery.data?.configuration, ...overrides };

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/configurations/${data.configurationId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(flags) }),
    onSuccess: () => goNext(),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Self-Service</CardTitle>
        <CardDescription>Optional customer-facing self-service features.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">SQL self-service</p>
            <p className="text-xs text-muted-foreground">Expose a read-only SQL Analytics Endpoint to the customer portal.</p>
          </div>
          <Switch
            checked={flags.sqlSelfServiceEnabled}
            onCheckedChange={(checked) => setOverrides((o) => ({ ...o, sqlSelfServiceEnabled: checked }))}
          />
        </div>
        {flags.sqlSelfServiceEnabled && (
          <div className="flex flex-col gap-1.5 pl-3">
            <Label htmlFor="sql-target-layer">Target layer</Label>
            <Input
              id="sql-target-layer"
              value={flags.sqlSelfServiceTargetLayer}
              onChange={(e) => setOverrides((o) => ({ ...o, sqlSelfServiceTargetLayer: e.target.value }))}
              className="max-w-xs"
            />
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Semantic model</p>
            <p className="text-xs text-muted-foreground">Let the customer build their own semantic model on top of Gold.</p>
          </div>
          <Switch
            checked={flags.semanticModelEnabled}
            onCheckedChange={(checked) => setOverrides((o) => ({ ...o, semanticModelEnabled: checked }))}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Starter report</p>
            <p className="text-xs text-muted-foreground">Provision a starter Power BI report the customer can view.</p>
          </div>
          <Switch
            checked={flags.starterReportEnabled}
            onCheckedChange={(checked) => setOverrides((o) => ({ ...o, starterReportEnabled: checked }))}
          />
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
