"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/wizard/combobox";
import type { WizardBlueprintResource } from "@/components/wizard/types";
import {
  coerceParameterValue,
  getInitialParameterValue,
  groupParametersByMode,
  parseParameterOptions,
  PICKER_INPUT_TYPES,
  type ParameterSchemaLike,
} from "./field-mapping";
import type { ParameterMode } from "@/generated/prisma/enums";

export interface FabricCapabilitySummary {
  itemType: string;
  displayName: string;
  parameterSchemas: ParameterSchemaLike[];
}

const MODE_LABELS: Record<ParameterMode, string> = { basic: "Basic", advanced: "Advanced", raw: "Raw" };

export interface DynamicParameterFormProps {
  resources: WizardBlueprintResource[];
  /** FabricCapability.itemType -> its parameter schemas, from
   * `GET /api/fabric-capabilities`. */
  capabilities: Map<string, FabricCapabilitySummary>;
  /** The customer's own connections, for `connectionPicker` fields. */
  connectionOptions: ComboboxOption[];
  /** Raw (pre-coercion) form values: logicalName -> paramKey -> value. */
  values: Record<string, Record<string, unknown>>;
  onFieldChange: (logicalName: string, key: string, value: unknown) => void;
}

/**
 * The Dynamic Parameter Engine's generic form renderer (brief: "one generic
 * form renderer driven by parameter schema rows, not
 * LakehouseForm.tsx/PipelineForm.tsx"). Renders one Accordion item per
 * blueprint resource, grouping that resource's `FabricParameterSchema` rows
 * into Basic/Advanced/Raw tabs and mapping each `ParameterInputType` to a
 * shadcn control. No Fabric item type is referenced by name anywhere below.
 */
export function DynamicParameterForm({ resources, capabilities, connectionOptions, values, onFieldChange }: DynamicParameterFormProps) {
  return (
    <Accordion type="multiple" defaultValue={resources.map((r) => r.logicalName)} className="rounded-lg border px-3">
      {resources.map((resource) => {
        const capability = capabilities.get(resource.itemType);
        const schemas = capability?.parameterSchemas ?? [];
        const grouped = groupParametersByMode(schemas);
        const resourceValues = values[resource.logicalName] ?? {};
        const nonEmptyModes = (Object.keys(grouped) as ParameterMode[]).filter((mode) => grouped[mode].length > 0);

        return (
          <AccordionItem key={resource.logicalName} value={resource.logicalName}>
            <AccordionTrigger>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{resource.displayNameTemplate}</span>
                <Badge variant="outline">{resource.itemType}</Badge>
                {resource.layer && <Badge variant="secondary">{resource.layer}</Badge>}
                {resource.optional && <Badge variant="ghost">optional</Badge>}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {!capability && (
                <p className="text-sm text-muted-foreground">
                  No Fabric capability parameter schema registered for &quot;{resource.itemType}&quot; — this resource will deploy with
                  its blueprint defaults only.
                </p>
              )}
              {nonEmptyModes.length > 0 && (
                <Tabs defaultValue={nonEmptyModes[0]}>
                  <TabsList>
                    {nonEmptyModes.map((mode) => (
                      <TabsTrigger key={mode} value={mode}>
                        {MODE_LABELS[mode]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {nonEmptyModes.map((mode) => (
                    <TabsContent key={mode} value={mode} className="flex flex-col gap-3 pt-3">
                      {grouped[mode].map((schema) => (
                        <ParameterField
                          key={schema.key}
                          logicalName={resource.logicalName}
                          schema={schema}
                          value={resourceValues[schema.key] ?? getInitialParameterValue(schema)}
                          connectionOptions={connectionOptions}
                          onChange={(value) => onFieldChange(resource.logicalName, schema.key, value)}
                        />
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function ParameterField({
  logicalName,
  schema,
  value,
  connectionOptions,
  onChange,
}: {
  logicalName: string;
  schema: ParameterSchemaLike;
  value: unknown;
  connectionOptions: ComboboxOption[];
  onChange: (value: unknown) => void;
}) {
  const id = `param-${logicalName}-${schema.key}`;
  const label = (
    <Label htmlFor={id}>
      {schema.label}
      {schema.required && <span className="text-destructive"> *</span>}
    </Label>
  );

  if (schema.inputType === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2">
        {label}
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }

  if (schema.inputType === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Textarea id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        {schema.description && <p className="text-xs text-muted-foreground">{schema.description}</p>}
      </div>
    );
  }

  if (schema.inputType === "json") {
    const raw = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
    const result = coerceParameterValue("json", raw);
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Textarea id={id} value={raw} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" rows={4} />
        {!result.ok && <p className="text-xs text-destructive">{result.error}</p>}
        {schema.description && result.ok && <p className="text-xs text-muted-foreground">{schema.description}</p>}
      </div>
    );
  }

  if (schema.inputType === "select") {
    const options = parseParameterOptions(schema.optionsJson);
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (schema.inputType === "multiSelect") {
    const options = parseParameterOptions(schema.optionsJson);
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Combobox multiple options={options} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />
      </div>
    );
  }

  if (schema.inputType === "connectionPicker") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Combobox
          options={connectionOptions}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          placeholder="Choose a connection…"
          emptyText="No connections yet — add one in the Data Sources step."
        />
      </div>
    );
  }

  if (PICKER_INPUT_TYPES.has(schema.inputType)) {
    // No listing API exists in this task's scope for
    // resourcePicker/workspacePicker/folderPicker/userPicker (only
    // connectionPicker has a backing route) — pragmatic free-text fallback,
    // called out in the implementation report.
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${schema.inputType.replace("Picker", "").toLowerCase()} id`}
        />
        <p className="text-xs text-muted-foreground">No lookup available yet — enter the id directly.</p>
      </div>
    );
  }

  const htmlType = schema.inputType === "number" ? "number" : schema.inputType === "password" ? "password" : schema.inputType === "date" ? "date" : schema.inputType === "datetime" ? "datetime-local" : "text";

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <Input
        id={id}
        type={htmlType}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={schema.inputType === "password" ? "new-password" : undefined}
      />
      {schema.description && <p className="text-xs text-muted-foreground">{schema.description}</p>}
    </div>
  );
}
