"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { updateFabricCapabilityClientInput, type UpdateFabricCapabilityClientInput } from "@/components/admin-portal/schemas";
import { fabricParameterSchemaInput, type FabricParameterSchemaInput } from "@/schemas/fabric-capability";
import { FabricCapabilityCategory, ParameterInputType, ParameterMode } from "@/generated/prisma/enums";
import type { CapabilityWithParameters } from "@/services/fabric/capability-registry";
import type { FabricParameterSchema } from "@/generated/prisma/client";

interface CapabilityResponse {
  capability: CapabilityWithParameters;
}
interface ParameterResponse {
  parameter: FabricParameterSchema;
}

async function fetchCapability(id: string): Promise<CapabilityWithParameters> {
  const body = await fetchJson<CapabilityResponse>(`/api/admin/fabric-capabilities/${id}`);
  return body.capability;
}

function jsonTextOrUndefined(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed);
}

/** One generic form for every `ParameterInputType`/`ParameterMode`
 * combination — matching the registry's own "no per-item-type UI"
 * philosophy. `defaultValue`/`options`/`validation` are edited as raw JSON
 * text because their shape depends on the row's own `inputType`, not on a
 * fixed set of fields this form would otherwise have to special-case. */
function ParameterRowForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
}: {
  initial?: Omit<Partial<FabricParameterSchemaInput>, "defaultValue" | "options" | "validation"> & {
    defaultValue?: unknown;
    options?: unknown;
    validation?: unknown;
  };
  onSubmit: (input: FabricParameterSchemaInput) => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [inputType, setInputType] = useState<string>(initial?.inputType ?? "text");
  const [mode, setMode] = useState<string>(initial?.mode ?? "basic");
  const [required, setRequired] = useState(initial?.required ?? false);
  const [targetPath, setTargetPath] = useState(initial?.targetPath ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [defaultValueText, setDefaultValueText] = useState(initial?.defaultValue !== undefined ? JSON.stringify(initial.defaultValue) : "");
  const [optionsText, setOptionsText] = useState(initial?.options !== undefined ? JSON.stringify(initial.options) : "");
  const [validationText, setValidationText] = useState(initial?.validation !== undefined ? JSON.stringify(initial.validation) : "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let defaultValue: unknown;
    let options: unknown;
    let validation: unknown;
    try {
      defaultValue = jsonTextOrUndefined(defaultValueText);
      options = jsonTextOrUndefined(optionsText);
      validation = jsonTextOrUndefined(validationText);
    } catch {
      setError("Default value / options / validation must be valid JSON.");
      return;
    }
    const parsed = fabricParameterSchemaInput.safeParse({
      key,
      label,
      description: description || undefined,
      inputType,
      mode,
      required,
      targetPath,
      sortOrder,
      defaultValue,
      options,
      validation,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid parameter row");
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="param-key">Key</Label>
          <Input id="param-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="defaultSchema" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="param-label">Label</Label>
          <Input id="param-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Default schema" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="param-description">Description</Label>
        <Textarea id="param-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Input type</Label>
          <Select value={inputType} onValueChange={setInputType}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(ParameterInputType).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Mode</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(ParameterMode).map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="param-target">Target path</Label>
          <Input id="param-target" value={targetPath} onChange={(e) => setTargetPath(e.target.value)} placeholder="creationPayload.defaultSchema" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="param-sort">Sort order</Label>
          <Input id="param-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={required} onCheckedChange={setRequired} />
        Required
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="param-default">Default value (JSON, optional)</Label>
        <Textarea id="param-default" value={defaultValueText} onChange={(e) => setDefaultValueText(e.target.value)} rows={2} placeholder='"Sales" or 42 or true' />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="param-options">Options (JSON array of {"{"}value,label{"}"}, optional — used by select/multiSelect)</Label>
        <Textarea id="param-options" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={2} placeholder='[{"value":"gzip","label":"Gzip"}]' />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="param-validation">Validation (JSON: min/max/pattern/enum, optional)</Label>
        <Textarea id="param-validation" value={validationText} onChange={(e) => setValidationText(e.target.value)} rows={2} placeholder='{"min":1,"max":100}' />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function FabricCapabilityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addParamOpen, setAddParamOpen] = useState(false);
  const [editParamId, setEditParamId] = useState<string | null>(null);

  const { data: capability, isLoading, isError } = useQuery({
    queryKey: ["admin-fabric-capability", id],
    queryFn: () => fetchCapability(id),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-fabric-capability", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-fabric-capabilities"] });
  }

  const updateCapabilityMutation = useMutation({
    mutationFn: (input: UpdateFabricCapabilityClientInput) =>
      fetchJson<CapabilityResponse>(`/api/admin/fabric-capabilities/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Capability updated.");
      setEditOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addParamMutation = useMutation({
    mutationFn: (input: FabricParameterSchemaInput) =>
      fetchJson<ParameterResponse>(`/api/admin/fabric-capabilities/${id}/parameters`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Parameter added.");
      setAddParamOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateParamMutation = useMutation({
    mutationFn: ({ paramId, input }: { paramId: string; input: FabricParameterSchemaInput }) =>
      fetchJson<ParameterResponse>(`/api/admin/fabric-capabilities/${id}/parameters/${paramId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Parameter updated.");
      setEditParamId(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteParamMutation = useMutation({
    mutationFn: (paramId: string) => fetchJson(`/api/admin/fabric-capabilities/${id}/parameters/${paramId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Parameter deleted.");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !capability) return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-destructive">Capability not found.</div>;

  const editingParam = capability.parameterSchemas.find((p) => p.id === editParamId) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin/fabric-registry" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to registry
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{capability.displayName}</h1>
          <p className="font-mono text-sm text-muted-foreground">{capability.itemType}</p>
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Pencil className="size-3.5" /> Edit</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit capability</DialogTitle>
              <DialogDescription>{capability.itemType}</DialogDescription>
            </DialogHeader>
            <EditCapabilityForm
              capability={capability}
              submitting={updateCapabilityMutation.isPending}
              onSubmit={(input) => updateCapabilityMutation.mutate(input)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Category" value={capability.category} />
          <Field label="Enabled" value={<Badge variant={capability.enabled ? "default" : "outline"}>{capability.enabled ? "Yes" : "No"}</Badge>} />
          <Field label="API path" value={capability.apiPath} mono />
          <Field label="Create supported" value={capability.createSupported ? "Yes" : "No"} />
          <Field label="Update supported" value={capability.updateSupported ? "Yes" : "No"} />
          <Field label="Delete supported" value={capability.deleteSupported ? "Yes" : "No"} />
          <Field label="Definition supported" value={capability.definitionSupported ? "Yes" : "No"} />
          <Field label="Creation payload supported" value={capability.creationPayloadSupported ? "Yes" : "No"} />
          <Field label="Folder supported" value={capability.folderSupported ? "Yes" : "No"} />
          <Field label="Service principal supported" value={capability.servicePrincipalSupported ? "Yes" : "No"} />
          <Field label="Required scopes" value={capability.requiredScopes.join(", ") || "—"} />
          {capability.description && <Field label="Description" value={capability.description} />}
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Parameter schema</h2>
        <Dialog open={addParamOpen} onOpenChange={setAddParamOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-3.5" /> Add parameter</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add parameter</DialogTitle>
              <DialogDescription>One generic row form drives every input type/mode combination.</DialogDescription>
            </DialogHeader>
            <ParameterRowForm submitLabel="Add" submitting={addParamMutation.isPending} onSubmit={(input) => addParamMutation.mutate(input)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Input type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Target path</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capability.parameterSchemas.map((param) => (
                <TableRow key={param.id}>
                  <TableCell className="font-mono text-xs">{param.key}</TableCell>
                  <TableCell>{param.label}</TableCell>
                  <TableCell>{param.inputType}</TableCell>
                  <TableCell>{param.mode}</TableCell>
                  <TableCell>{param.required ? "Yes" : "No"}</TableCell>
                  <TableCell className="font-mono text-xs">{param.targetPath}</TableCell>
                  <TableCell>{param.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog open={editParamId === param.id} onOpenChange={(o) => setEditParamId(o ? param.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Edit parameter</DialogTitle>
                          </DialogHeader>
                          {editingParam && editingParam.id === param.id && (
                            <ParameterRowForm
                              submitLabel="Save"
                              submitting={updateParamMutation.isPending}
                              initial={{
                                key: editingParam.key,
                                label: editingParam.label,
                                description: editingParam.description ?? undefined,
                                inputType: editingParam.inputType,
                                mode: editingParam.mode,
                                required: editingParam.required,
                                targetPath: editingParam.targetPath,
                                sortOrder: editingParam.sortOrder,
                                defaultValue: editingParam.defaultValue ?? undefined,
                                options: editingParam.optionsJson ?? undefined,
                                validation: editingParam.validationJson ?? undefined,
                              }}
                              onSubmit={(input) => updateParamMutation.mutate({ paramId: param.id, input })}
                            />
                          )}
                        </DialogContent>
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><Trash2 className="size-3.5 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete parameter &quot;{param.key}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteParamMutation.mutate(param.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {capability.parameterSchemas.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No parameter rows yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : undefined}>{value}</span>
    </div>
  );
}

function EditCapabilityForm({
  capability,
  onSubmit,
  submitting,
}: {
  capability: CapabilityWithParameters;
  onSubmit: (input: UpdateFabricCapabilityClientInput) => void;
  submitting: boolean;
}) {
  const [displayName, setDisplayName] = useState(capability.displayName);
  const [category, setCategory] = useState<string>(capability.category);
  const [description, setDescription] = useState(capability.description ?? "");
  const [apiPath, setApiPath] = useState(capability.apiPath);
  const [documentationUrl, setDocumentationUrl] = useState(capability.documentationUrl ?? "");
  const [flags, setFlags] = useState({
    enabled: capability.enabled,
    createSupported: capability.createSupported,
    updateSupported: capability.updateSupported,
    deleteSupported: capability.deleteSupported,
    definitionSupported: capability.definitionSupported,
    creationPayloadSupported: capability.creationPayloadSupported,
    folderSupported: capability.folderSupported,
    servicePrincipalSupported: capability.servicePrincipalSupported,
  });
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = updateFabricCapabilityClientInput.safeParse({
      displayName,
      category,
      description: description || undefined,
      apiPath,
      documentationUrl: documentationUrl || undefined,
      ...flags,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-displayName">Display name</Label>
        <Input id="edit-displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.values(FabricCapabilityCategory).map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-apiPath">API path</Label>
        <Input id="edit-apiPath" value={apiPath} onChange={(e) => setApiPath(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-doc">Documentation URL</Label>
        <Input id="edit-doc" value={documentationUrl} onChange={(e) => setDocumentationUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(flags) as (keyof typeof flags)[]).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <Switch checked={flags[key]} onCheckedChange={(v) => setFlags((f) => ({ ...f, [key]: v }))} />
            {key}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
