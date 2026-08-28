"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";
import { DynamicParameterForm, type FabricCapabilitySummary } from "@/components/wizard/parameter-form/dynamic-parameter-form";
import { coerceParameterValue, type ParameterSchemaLike } from "@/components/wizard/parameter-form/field-mapping";
import type { ComboboxOption } from "@/components/wizard/combobox";

interface ApiCapability {
  itemType: string;
  displayName: string;
  parameterSchemas: ParameterSchemaLike[];
}

interface ApiConnection {
  id: string;
  displayName: string;
  connectorTypeKey: string;
}

export function StepFabricResources({ data, update, goNext, goBack }: WizardStepProps) {
  const capabilitiesQuery = useQuery({
    queryKey: ["wizard-fabric-capabilities"],
    queryFn: () => fetchJson<{ capabilities: ApiCapability[] }>("/api/fabric-capabilities"),
  });

  const connectionsQuery = useQuery({
    queryKey: ["wizard-connections", data.customerId],
    queryFn: () => fetchJson<{ connections: ApiConnection[] }>(`/api/connections?customerId=${encodeURIComponent(data.customerId!)}`),
    enabled: Boolean(data.customerId),
  });

  const capabilitiesByItemType = useMemo(() => {
    const map = new Map<string, FabricCapabilitySummary>();
    for (const c of capabilitiesQuery.data?.capabilities ?? []) {
      map.set(c.itemType, { itemType: c.itemType, displayName: c.displayName, parameterSchemas: c.parameterSchemas });
    }
    return map;
  }, [capabilitiesQuery.data]);

  const connectionOptions: ComboboxOption[] = useMemo(
    () => (connectionsQuery.data?.connections ?? []).map((c) => ({ value: c.id, label: c.displayName })),
    [connectionsQuery.data],
  );

  const resources = data.blueprint?.resources ?? [];

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!data.configurationId) throw new Error("No configuration to save to yet");
      const overrides: Record<string, Record<string, unknown>> = {};
      for (const resource of resources) {
        const capability = capabilitiesByItemType.get(resource.itemType);
        const rawValues = data.resourceParameterValues[resource.logicalName] ?? {};
        const resolved: Record<string, unknown> = {};
        for (const schema of capability?.parameterSchemas ?? []) {
          const raw = rawValues[schema.key];
          if (raw === undefined) continue;
          const coerced = coerceParameterValue(schema.inputType, raw);
          if (coerced.ok && coerced.value !== undefined) resolved[schema.key] = coerced.value;
        }
        if (Object.keys(resolved).length > 0) overrides[resource.logicalName] = resolved;
      }
      return fetchJson(`/api/configurations/${data.configurationId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ resourceParameterOverrides: overrides }),
      });
    },
    onSuccess: () => goNext(),
    onError: (error: Error) => toast.error(error.message),
  });

  function onFieldChange(logicalName: string, key: string, value: unknown) {
    update({
      resourceParameterValues: {
        ...data.resourceParameterValues,
        [logicalName]: { ...(data.resourceParameterValues[logicalName] ?? {}), [key]: value },
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fabric Resources</CardTitle>
        <CardDescription>
          Configure parameters for each resource this blueprint provisions. Fields are driven entirely by the Fabric Capability
          Registry — no per-resource form is hand-built.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {(capabilitiesQuery.isLoading || connectionsQuery.isLoading) && <Skeleton className="h-64 rounded-lg" />}
        {capabilitiesQuery.isError && <p className="text-sm text-destructive">Couldn&apos;t load the Fabric capability registry.</p>}

        {resources.length === 0 && !capabilitiesQuery.isLoading && (
          <p className="text-sm text-muted-foreground">This blueprint has no resources defined.</p>
        )}

        {resources.length > 0 && !capabilitiesQuery.isLoading && (
          <DynamicParameterForm
            resources={resources}
            capabilities={capabilitiesByItemType}
            connectionOptions={connectionOptions}
            values={data.resourceParameterValues}
            onFieldChange={onFieldChange}
          />
        )}

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
