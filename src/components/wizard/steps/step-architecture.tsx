"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps, WizardBlueprint } from "@/components/wizard/types";
import type { CreateConfigurationDraft } from "@/features/provisioning/schemas";

interface ConfigurationResponse {
  configuration: { id: string; name: string };
}

export function StepArchitecture({ data, update, goNext, goBack }: WizardStepProps) {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(data.blueprint?.id ?? null);
  const [name, setName] = useState(data.configurationName ?? "");

  const blueprintsQuery = useQuery({
    queryKey: ["wizard-blueprints"],
    queryFn: () => fetchJson<{ blueprints: WizardBlueprint[] }>("/api/blueprints"),
  });

  const selectedBlueprint = blueprintsQuery.data?.blueprints.find((b) => b.id === selectedBlueprintId) ?? null;

  function selectBlueprint(blueprint: WizardBlueprint) {
    setSelectedBlueprintId(blueprint.id);
    if (!name.trim() && data.customerName) {
      setName(`${data.customerName} - ${blueprint.name}`);
    }
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!data.customerId || !selectedBlueprint) throw new Error("Choose a blueprint first");
      const body: CreateConfigurationDraft = {
        name: name.trim() || `${data.customerName ?? "Customer"} - ${selectedBlueprint.name}`,
        blueprintId: selectedBlueprint.id,
        architecture: selectedBlueprint.pattern,
      };
      return fetchJson<ConfigurationResponse>(`/api/customers/${data.customerId}/configurations`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
    },
    onSuccess: ({ configuration }) => {
      toast.success("Configuration created.");
      update({ configurationId: configuration.id, configurationName: configuration.name, blueprint: selectedBlueprint });
      goNext();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Architecture</CardTitle>
        <CardDescription>Choose a blueprint — the set of Fabric resources this deployment will provision.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {blueprintsQuery.isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        )}
        {blueprintsQuery.isError && <p className="text-sm text-destructive">Couldn&apos;t load blueprints.</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {blueprintsQuery.data?.blueprints.map((blueprint) => (
            <button
              key={blueprint.id}
              type="button"
              onClick={() => selectBlueprint(blueprint)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-secondary",
                blueprint.id === selectedBlueprintId && "ring-2 ring-primary",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Layers className="size-4" />
                </span>
                <span className="font-medium">{blueprint.name}</span>
              </div>
              {blueprint.description && <p className="text-sm text-muted-foreground">{blueprint.description}</p>}
              <div className="flex gap-1.5">
                <Badge variant="secondary">{blueprint.pattern}</Badge>
                <Badge variant="outline">{blueprint.resources.length} resources</Badge>
              </div>
            </button>
          ))}
        </div>

        {selectedBlueprint && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="configuration-name">Configuration name</Label>
            <Input id="configuration-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button
            type="button"
            disabled={!selectedBlueprint || createMutation.isPending}
            onClick={() => {
              // Already created this exact configuration earlier in the
              // session (the user navigated back and forward again) —
              // don't create a duplicate InfrastructureConfiguration row.
              if (data.configurationId && data.blueprint?.id === selectedBlueprint?.id) {
                goNext();
                return;
              }
              createMutation.mutate();
            }}
          >
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
