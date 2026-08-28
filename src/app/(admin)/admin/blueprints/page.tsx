"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { createBlueprintClientInput, type CreateBlueprintClientInput } from "@/components/admin-portal/schemas";
import { ArchitecturePattern } from "@/generated/prisma/enums";
import type { BlueprintWithResources } from "@/features/admin-portal/blueprints";

interface BlueprintListItem extends BlueprintWithResources {
  configurationCount: number;
}
interface BlueprintsResponse {
  blueprints: BlueprintListItem[];
}
interface BlueprintResponse {
  blueprint: BlueprintWithResources;
}

async function fetchBlueprints(): Promise<BlueprintListItem[]> {
  const body = await fetchJson<BlueprintsResponse>("/api/admin/blueprints");
  return body.blueprints;
}

function CreateBlueprintDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pattern, setPattern] = useState<string>("custom");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: CreateBlueprintClientInput) =>
      fetchJson<BlueprintResponse>("/api/admin/blueprints", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Blueprint created.");
      queryClient.invalidateQueries({ queryKey: ["admin-blueprints"] });
      setOpen(false);
      setKey("");
      setName("");
      setDescription("");
      setPattern("custom");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createBlueprintClientInput.safeParse({ key, name, description: description || undefined, pattern, resources: [] });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    createMutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" /> New blueprint</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a blueprint</DialogTitle>
          <DialogDescription>Resources can be added afterward from the blueprint detail page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bp-key">Key</Label>
            <Input id="bp-key" placeholder="my-custom-pattern" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bp-name">Name</Label>
            <Input id="bp-name" placeholder="My Custom Pattern" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bp-description">Description</Label>
            <Textarea id="bp-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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

export default function BlueprintsPage() {
  const { data: blueprints, isLoading, isError } = useQuery({
    queryKey: ["admin-blueprints"],
    queryFn: fetchBlueprints,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blueprints</h1>
          <p className="text-sm text-muted-foreground">Reusable resource sets a customer&apos;s infrastructure configuration is planned from.</p>
        </div>
        <CreateBlueprintDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading blueprints…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load blueprints.</p>}

      {!isLoading && !isError && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead>Used by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blueprints?.map((bp) => (
                  <TableRow key={bp.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/admin/blueprints/${bp.id}`} className="hover:underline">{bp.key}</Link>
                    </TableCell>
                    <TableCell>{bp.name}</TableCell>
                    <TableCell><Badge variant="outline">{bp.pattern}</Badge></TableCell>
                    <TableCell>{bp.isSystem ? <Badge variant="secondary">System</Badge> : "—"}</TableCell>
                    <TableCell>{bp.resources.length}</TableCell>
                    <TableCell>{bp.configurationCount}</TableCell>
                  </TableRow>
                ))}
                {blueprints?.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No blueprints yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
