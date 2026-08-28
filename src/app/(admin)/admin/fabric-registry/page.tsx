"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { createFabricCapabilityClientInput, type CreateFabricCapabilityClientInput } from "@/components/admin-portal/schemas";
import { FabricCapabilityCategory } from "@/generated/prisma/enums";
import type { CapabilityWithParameters } from "@/services/fabric/capability-registry";

const CATEGORY_LABELS: Record<string, string> = {
  storage: "Storage",
  compute: "Compute",
  pipeline: "Pipeline",
  analytics: "Analytics",
  realtime: "Realtime",
  data_science: "Data Science",
  reporting: "Reporting",
  governance: "Governance",
  other: "Other",
};

const CATEGORY_ORDER = Object.values(FabricCapabilityCategory);

interface CapabilitiesResponse {
  capabilities: CapabilityWithParameters[];
}

async function fetchCapabilities(category: string | "all"): Promise<CapabilityWithParameters[]> {
  const qs = category === "all" ? "" : `?category=${encodeURIComponent(category)}`;
  const body = await fetchJson<CapabilitiesResponse>(`/api/admin/fabric-capabilities${qs}`);
  return body.capabilities;
}

function FlagDot({ on }: { on: boolean }) {
  return <span className={on ? "text-foreground" : "text-muted-foreground/40"}>{on ? "Yes" : "No"}</span>;
}

function CreateCapabilityDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    itemType: "",
    displayName: "",
    category: "other" as (typeof CATEGORY_ORDER)[number],
    apiPath: "",
    enabled: true,
    createSupported: false,
    updateSupported: false,
    deleteSupported: false,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: CreateFabricCapabilityClientInput) =>
      fetchJson("/api/admin/fabric-capabilities", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Fabric capability registered.");
      queryClient.invalidateQueries({ queryKey: ["admin-fabric-capabilities"] });
      setOpen(false);
      setForm({ itemType: "", displayName: "", category: "other", apiPath: "", enabled: true, createSupported: false, updateSupported: false, deleteSupported: false });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createFabricCapabilityClientInput.safeParse({ ...form, parameters: [] });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    createMutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New capability
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register a Fabric capability</DialogTitle>
          <DialogDescription>Adds a row to the Fabric Capability Registry. Parameter schema rows can be added afterward.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemType">Item type</Label>
            <Input id="itemType" placeholder="Lakehouse" value={form.itemType} onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" placeholder="Lakehouse" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiPath">API path</Label>
            <Input id="apiPath" placeholder="lakehouses" value={form.apiPath} onChange={(e) => setForm((f) => ({ ...f, apiPath: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as (typeof CATEGORY_ORDER)[number] }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4">
            {(["enabled", "createSupported", "updateSupported", "deleteSupported"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch checked={form[key]} onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />
                {key}
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FabricRegistryPage() {
  const [category, setCategory] = useState<string>("all");

  const { data: capabilities, isLoading, isError } = useQuery({
    queryKey: ["admin-fabric-capabilities", category],
    queryFn: () => fetchCapabilities(category),
  });

  const grouped = new Map<string, CapabilityWithParameters[]>();
  for (const cap of capabilities ?? []) {
    const list = grouped.get(cap.category) ?? [];
    list.push(cap);
    grouped.set(cap.category, list);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fabric Capability Registry</h1>
          <p className="text-sm text-muted-foreground">Every Fabric item type OneClick knows how to provision — no item type is hardcoded into a form.</p>
        </div>
        <CreateCapabilityDialog />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_ORDER.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading capabilities…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load the capability registry.</p>}

      {!isLoading && !isError && [...grouped.entries()].map(([cat, items]) => (
        <Card key={cat} className="mb-4">
          <CardHeader>
            <CardTitle>{CATEGORY_LABELS[cat] ?? cat}</CardTitle>
            <CardDescription>{items.length} capabilit{items.length === 1 ? "y" : "ies"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item type</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Create</TableHead>
                  <TableHead>Update</TableHead>
                  <TableHead>Delete</TableHead>
                  <TableHead>Parameters</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((cap) => (
                  <TableRow key={cap.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/admin/fabric-registry/${cap.id}`} className="hover:underline">{cap.itemType}</Link>
                    </TableCell>
                    <TableCell>{cap.displayName}</TableCell>
                    <TableCell><Badge variant={cap.enabled ? "default" : "outline"}>{cap.enabled ? "Enabled" : "Disabled"}</Badge></TableCell>
                    <TableCell><FlagDot on={cap.createSupported} /></TableCell>
                    <TableCell><FlagDot on={cap.updateSupported} /></TableCell>
                    <TableCell><FlagDot on={cap.deleteSupported} /></TableCell>
                    <TableCell>{cap.parameterSchemas.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {!isLoading && !isError && grouped.size === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No capabilities registered yet.</CardContent></Card>
      )}
    </div>
  );
}
