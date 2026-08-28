"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import {
  updateBlueprintClientInput,
  type BlueprintResourceClientInput,
  type UpdateBlueprintClientInput,
} from "@/components/admin-portal/schemas";
import { ArchitecturePattern } from "@/generated/prisma/enums";
import { assertBlueprintDeletable, BlueprintInUseError, SystemBlueprintNotDeletableError } from "@/features/admin-portal/pure/blueprint-guard";
import type { BlueprintWithResources } from "@/features/admin-portal/blueprints";
import { useRouter } from "next/navigation";

interface BlueprintResponse {
  blueprint: BlueprintWithResources;
}
interface BlueprintListItem extends BlueprintWithResources {
  configurationCount: number;
}

async function fetchBlueprint(id: string): Promise<BlueprintWithResources> {
  const body = await fetchJson<BlueprintResponse>(`/api/admin/blueprints/${id}`);
  return body.blueprint;
}

async function fetchConfigurationCount(id: string): Promise<number> {
  // The list endpoint is the only one that returns the referencing-config
  // count; the detail endpoint deliberately doesn't join it (see
  // getAdminBlueprint's module doc). Reused here only to drive the
  // disabled-delete guard, not re-fetched on every render.
  const body = await fetchJson<{ blueprints: BlueprintListItem[] }>("/api/admin/blueprints");
  return body.blueprints.find((b) => b.id === id)?.configurationCount ?? 0;
}

type ResourceRow = BlueprintResourceClientInput & { dependsOnText: string };

function resourceToRow(r: BlueprintResourceClientInput): ResourceRow {
  return { ...r, dependsOnText: (r.dependsOn ?? []).join(", ") };
}

function initialRowsFromBlueprint(blueprint: BlueprintWithResources): ResourceRow[] {
  return blueprint.resources.map((r) =>
    resourceToRow({
      itemType: r.itemType,
      logicalName: r.logicalName,
      displayNameTemplate: r.displayNameTemplate,
      configuration: (r.configuration as Record<string, unknown>) ?? {},
      dependsOn: r.dependsOn,
      optional: r.optional,
      layer: r.layer,
      sortOrder: r.sortOrder,
    }),
  );
}

export default function BlueprintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: blueprint, isLoading, isError } = useQuery({
    queryKey: ["admin-blueprint", id],
    queryFn: () => fetchBlueprint(id),
  });
  const { data: configurationCount } = useQuery({
    queryKey: ["admin-blueprint-configuration-count", id],
    queryFn: () => fetchConfigurationCount(id),
    enabled: Boolean(blueprint),
  });

  const cloneMutation = useMutation({
    mutationFn: () => fetchJson<BlueprintResponse>(`/api/admin/blueprints/${id}/clone`, { method: "POST" }),
    onSuccess: (body) => {
      toast.success("Blueprint cloned.");
      queryClient.invalidateQueries({ queryKey: ["admin-blueprints"] });
      router.push(`/admin/blueprints/${body.blueprint.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => fetchJson(`/api/admin/blueprints/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Blueprint deleted.");
      router.push("/admin/blueprints");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !blueprint) return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-destructive">Blueprint not found.</div>;

  let deleteBlockedReason: string | null = null;
  if (configurationCount !== undefined) {
    try {
      assertBlueprintDeletable({ isSystem: blueprint.isSystem, referencingConfigurationCount: configurationCount });
    } catch (err) {
      deleteBlockedReason =
        err instanceof SystemBlueprintNotDeletableError || err instanceof BlueprintInUseError ? err.message : "Cannot delete this blueprint.";
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin/blueprints" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to blueprints
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{blueprint.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{blueprint.key}</p>
        </div>
        <div className="flex items-center gap-2">
          {blueprint.isSystem && <Badge variant="secondary">System</Badge>}
          <Button variant="outline" size="sm" onClick={() => cloneMutation.mutate()} disabled={cloneMutation.isPending}>
            {cloneMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
            Clone
          </Button>
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={Boolean(deleteBlockedReason)}>
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                </span>
              </TooltipTrigger>
              {deleteBlockedReason && <TooltipContent>{deleteBlockedReason}</TooltipContent>}
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete blueprint &quot;{blueprint.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Keyed by id so navigating between blueprint detail pages (clone ->
          redirect) starts the editor's local form state fresh from the new
          blueprint's data, without needing a state-syncing effect. */}
      <BlueprintEditor key={blueprint.id} blueprintId={id} initial={blueprint} />
    </div>
  );
}

function BlueprintEditor({ blueprintId, initial }: { blueprintId: string; initial: BlueprintWithResources }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [pattern, setPattern] = useState<string>(initial.pattern);
  const [rows, setRows] = useState<ResourceRow[]>(() => initialRowsFromBlueprint(initial));
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-blueprint", blueprintId] });
    queryClient.invalidateQueries({ queryKey: ["admin-blueprints"] });
  }

  const updateFieldsMutation = useMutation({
    mutationFn: (input: UpdateBlueprintClientInput) =>
      fetchJson<BlueprintResponse>(`/api/admin/blueprints/${blueprintId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Blueprint details saved.");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateResourcesMutation = useMutation({
    mutationFn: (input: UpdateBlueprintClientInput) =>
      fetchJson<BlueprintResponse>(`/api/admin/blueprints/${blueprintId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Resources saved.");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSaveFields(e: React.FormEvent) {
    e.preventDefault();
    setFieldsError(null);
    const parsed = updateBlueprintClientInput.safeParse({ name, description: description || null, pattern });
    if (!parsed.success) {
      setFieldsError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    updateFieldsMutation.mutate(parsed.data);
  }

  function handleSaveResources() {
    setResourcesError(null);
    const resources = rows.map((r) => ({
      ...r,
      dependsOn: r.dependsOnText.split(",").map((s) => s.trim()).filter(Boolean),
    }));
    const parsed = updateBlueprintClientInput.safeParse({ resources });
    if (!parsed.success) {
      setResourcesError(parsed.error.issues[0]?.message ?? "Invalid resource list");
      return;
    }
    updateResourcesMutation.mutate(parsed.data);
  }

  function addRow() {
    setRows((r) => [
      ...r,
      resourceToRow({ itemType: "", logicalName: "", displayNameTemplate: "", configuration: {}, dependsOn: [], optional: false, layer: null, sortOrder: r.length }),
    ]);
  }

  function updateRow(index: number, patch: Partial<ResourceRow>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveFields} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bp-name">Name</Label>
                <Input id="bp-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Pattern</Label>
                <Select value={pattern} onValueChange={setPattern}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(ArchitecturePattern).map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bp-description">Description</Label>
              <Textarea id="bp-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            {fieldsError && <p className="text-sm text-destructive">{fieldsError}</p>}
            <div>
              <Button type="submit" size="sm" disabled={updateFieldsMutation.isPending}>
                {updateFieldsMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save details
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>Dependencies reference another row&apos;s logical name — a plain, textual list, not a DAG editor.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">Item type</TableHead>
                  <TableHead className="min-w-28">Logical name</TableHead>
                  <TableHead className="min-w-40">Display name template</TableHead>
                  <TableHead className="min-w-20">Layer</TableHead>
                  <TableHead className="min-w-36">Depends on (comma-sep.)</TableHead>
                  <TableHead>Optional</TableHead>
                  <TableHead className="min-w-16">Order</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell><Input value={row.itemType} onChange={(e) => updateRow(index, { itemType: e.target.value })} /></TableCell>
                    <TableCell><Input value={row.logicalName} onChange={(e) => updateRow(index, { logicalName: e.target.value })} /></TableCell>
                    <TableCell><Input value={row.displayNameTemplate} onChange={(e) => updateRow(index, { displayNameTemplate: e.target.value })} /></TableCell>
                    <TableCell><Input value={row.layer ?? ""} onChange={(e) => updateRow(index, { layer: e.target.value || null })} placeholder="bronze" /></TableCell>
                    <TableCell><Input value={row.dependsOnText} onChange={(e) => updateRow(index, { dependsOnText: e.target.value })} placeholder="bronze, silver" /></TableCell>
                    <TableCell><Switch checked={row.optional ?? false} onCheckedChange={(v) => updateRow(index, { optional: v })} /></TableCell>
                    <TableCell><Input type="number" className="w-16" value={row.sortOrder ?? 0} onChange={(e) => updateRow(index, { sortOrder: Number(e.target.value) })} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeRow(index)}><Trash2 className="size-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No resources yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="size-3.5" /> Add resource</Button>
            <div className="flex items-center gap-3">
              {resourcesError && <p className="text-sm text-destructive">{resourcesError}</p>}
              <Button type="button" size="sm" onClick={handleSaveResources} disabled={updateResourcesMutation.isPending}>
                {updateResourcesMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save resources
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
