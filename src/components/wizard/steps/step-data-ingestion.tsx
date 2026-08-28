"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createIngestionConfigurationInput, type CreateIngestionConfigurationDraft } from "@/schemas/ingestion";
import { LoadMethod, IngestionScheduleFrequency } from "@/generated/prisma/enums";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardConnectionSummary, WizardStepProps } from "@/components/wizard/types";

export function StepDataIngestion({ data, goNext, goBack }: WizardStepProps) {
  const [configured, setConfigured] = useState<Set<string>>(new Set());

  if (data.connections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data Ingestion</CardTitle>
          <CardDescription>No connections were added in the previous step — nothing to configure here.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" onClick={goNext}>
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Ingestion</CardTitle>
        <CardDescription>Set a load method and schedule for each connection. Optional per connection.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.connections.map((connection) => (
          <IngestionForm
            key={connection.id}
            connection={connection}
            customerId={data.customerId!}
            configurationId={data.configurationId!}
            destinationOptions={(data.blueprint?.resources ?? []).map((r) => r.logicalName)}
            done={configured.has(connection.id)}
            onDone={() => setConfigured((prev) => new Set(prev).add(connection.id))}
          />
        ))}

        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" onClick={goNext}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IngestionForm({
  connection,
  customerId,
  configurationId,
  destinationOptions,
  done,
  onDone,
}: {
  connection: WizardConnectionSummary;
  customerId: string;
  configurationId: string;
  destinationOptions: string[];
  done: boolean;
  onDone: () => void;
}) {
  const form = useForm<CreateIngestionConfigurationDraft>({
    resolver: zodResolver(createIngestionConfigurationInput),
    defaultValues: {
      customerId,
      infrastructureConfigurationId: configurationId,
      connectionId: connection.id,
      sourceObject: "",
      loadMethod: "full",
      destinationLogicalName: destinationOptions[0] ?? "",
      scheduleFrequency: "daily",
    },
  });

  const loadMethod = form.watch("loadMethod");

  const mutation = useMutation({
    mutationFn: (values: CreateIngestionConfigurationDraft) =>
      fetchJson("/api/ingestion", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(values) }),
    onSuccess: () => {
      toast.success(`Ingestion configured for "${connection.displayName}".`);
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-success">
        <CheckCircle2 className="size-4" />
        Ingestion configured for {connection.displayName}
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">{connection.displayName}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Source table/object</Label>
          <Input {...form.register("sourceObject")} placeholder="e.g. dbo.Orders" />
          {form.formState.errors.sourceObject && <p className="text-xs text-destructive">{form.formState.errors.sourceObject.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Destination resource</Label>
          <Select value={form.watch("destinationLogicalName")} onValueChange={(v) => form.setValue("destinationLogicalName", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose destination" />
            </SelectTrigger>
            <SelectContent>
              {destinationOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Load method</Label>
          <Select value={loadMethod} onValueChange={(v) => form.setValue("loadMethod", v as CreateIngestionConfigurationDraft["loadMethod"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(LoadMethod).map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loadMethod === "incremental" && (
          <div className="flex flex-col gap-1.5">
            <Label>Watermark column</Label>
            <Input {...form.register("watermarkColumn")} placeholder="e.g. ModifiedDate" />
            {form.formState.errors.watermarkColumn && <p className="text-xs text-destructive">{form.formState.errors.watermarkColumn.message}</p>}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label>Schedule</Label>
          <Select
            value={form.watch("scheduleFrequency")}
            onValueChange={(v) => form.setValue("scheduleFrequency", v as CreateIngestionConfigurationDraft["scheduleFrequency"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(IngestionScheduleFrequency).map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Save ingestion config
        </Button>
      </div>
    </form>
  );
}
