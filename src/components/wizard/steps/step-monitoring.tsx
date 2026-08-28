"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";

interface ConfigurationFlags {
  usageReportEnabled: boolean;
  usageReportOptionsJson: Record<string, boolean>;
  operationalAlertsEnabled: boolean;
}

const DEFAULT_FLAGS: ConfigurationFlags = {
  usageReportEnabled: false,
  usageReportOptionsJson: {},
  operationalAlertsEnabled: false,
};

const USAGE_OPTIONS: { key: string; label: string }[] = [
  { key: "serviceStatus", label: "Service status" },
  { key: "dataFreshness", label: "Data freshness" },
  { key: "refreshSuccess", label: "Refresh success rate" },
  { key: "usageTrend", label: "Usage trend" },
  { key: "advancedTechnicalMetrics", label: "Advanced technical metrics" },
];

export function StepMonitoring({ data, goNext, goBack }: WizardStepProps) {
  const configQuery = useQuery({
    queryKey: ["wizard-configuration", data.configurationId],
    queryFn: () => fetchJson<{ configuration: ConfigurationFlags }>(`/api/configurations/${data.configurationId}`),
    enabled: Boolean(data.configurationId),
  });

  // Local edits layered on top of the fetched configuration (see
  // step-self-service.tsx's identical comment) instead of an
  // effect-driven copy, which would trip react-hooks/set-state-in-effect.
  const [overrides, setOverrides] = useState<Partial<ConfigurationFlags>>({});
  const base = configQuery.data?.configuration ?? DEFAULT_FLAGS;
  const flags: ConfigurationFlags = {
    ...DEFAULT_FLAGS,
    ...base,
    ...overrides,
    usageReportOptionsJson: { ...base.usageReportOptionsJson, ...overrides.usageReportOptionsJson },
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/configurations/${data.configurationId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(flags) }),
    onSuccess: () => goNext(),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monitoring</CardTitle>
        <CardDescription>Configure the customer usage report and operational alerting.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Customer usage report</p>
            <p className="text-xs text-muted-foreground">Show a simplified usage report in the customer portal.</p>
          </div>
          <Switch
            checked={flags.usageReportEnabled}
            onCheckedChange={(checked) => setOverrides((o) => ({ ...o, usageReportEnabled: checked }))}
          />
        </div>

        {flags.usageReportEnabled && (
          <div className="flex flex-col gap-2 pl-3">
            {USAGE_OPTIONS.map((opt) => (
              <div key={opt.key} className="flex items-center justify-between">
                <p className="text-sm">{opt.label}</p>
                <Switch
                  checked={Boolean(flags.usageReportOptionsJson[opt.key])}
                  onCheckedChange={(checked) =>
                    setOverrides((o) => ({
                      ...o,
                      usageReportOptionsJson: { ...base.usageReportOptionsJson, ...o.usageReportOptionsJson, [opt.key]: checked },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Operational alerts</p>
            <p className="text-xs text-muted-foreground">Notify the platform team of ingestion/refresh failures for this customer.</p>
          </div>
          <Switch
            checked={flags.operationalAlertsEnabled}
            onCheckedChange={(checked) => setOverrides((o) => ({ ...o, operationalAlertsEnabled: checked }))}
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
