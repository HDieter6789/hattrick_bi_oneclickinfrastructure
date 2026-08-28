"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/components/admin-portal/api";
import type { ServiceAgent, User } from "@/generated/prisma/client";

type AgentWithUser = ServiceAgent & { user: User };

interface AgentsResponse {
  agents: AgentWithUser[];
}

async function fetchAgents(): Promise<AgentWithUser[]> {
  const body = await fetchJson<AgentsResponse>("/api/service-agents?activeOnly=false");
  return body.agents;
}

export default function ServiceAgentsPage() {
  const queryClient = useQueryClient();
  const { data: agents, isLoading, isError } = useQuery({
    queryKey: ["admin-service-agents"],
    queryFn: fetchAgents,
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/service-agents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Service agent deactivated.");
      queryClient.invalidateQueries({ queryKey: ["admin-service-agents"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service agents</h1>
          <p className="text-sm text-muted-foreground">Fabric specialists who staff onboarding appointments.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/admin/service-agents/new"><Plus className="size-4" /> New agent</Link>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading agents…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load service agents.</p>}

      {!isLoading && !isError && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents?.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>
                      <Link href={`/admin/service-agents/${agent.id}`} className="hover:underline">
                        {agent.user.name ?? agent.user.email}
                      </Link>
                    </TableCell>
                    <TableCell>{agent.language}</TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {agent.skills.map((s) => (<Badge key={s} variant="outline">{s}</Badge>))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.active ? "default" : "outline"}>{agent.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {agent.active && (
                        <Button variant="outline" size="sm" onClick={() => deactivateMutation.mutate(agent.id)} disabled={deactivateMutation.isPending}>
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {agents?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No service agents yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
