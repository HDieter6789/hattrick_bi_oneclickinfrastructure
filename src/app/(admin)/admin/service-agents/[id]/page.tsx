"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { updateServiceAgentInput, type UpdateServiceAgentDraft } from "@/features/appointments/schemas";
import { ServiceSkill } from "@/generated/prisma/enums";
import { formStateToWorkingHoursJson, workingHoursJsonToFormState, WorkingHoursEditor, type WorkingHoursFormState } from "../_working-hours-editor";
import type { ServiceAgent, User } from "@/generated/prisma/client";

type AgentWithUser = ServiceAgent & { user: User };

interface AgentsResponse {
  agents: AgentWithUser[];
}
interface AgentResponse {
  agent: ServiceAgent;
}

// GET /api/service-agents/[id] doesn't exist as a single-resource read
// (only PATCH/DELETE) — the list endpoint is filtered client-side instead,
// consistent with how few service agents there typically are.
async function fetchAgent(id: string): Promise<AgentWithUser | undefined> {
  const body = await fetchJson<AgentsResponse>("/api/service-agents?activeOnly=false");
  return body.agents.find((a) => a.id === id);
}

export default function ServiceAgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: agent, isLoading, isError } = useQuery({
    queryKey: ["admin-service-agent", id],
    queryFn: () => fetchAgent(id),
  });

  if (isLoading) return <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !agent) return <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-destructive">Service agent not found.</div>;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/admin/service-agents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to service agents
      </Link>
      {/* Keyed by id so the form's local state is seeded fresh from this
          agent's data via useState initializers, with no state-syncing
          effect needed. */}
      <ServiceAgentEditor key={agent.id} agentId={id} initial={agent} />
    </div>
  );
}

function ServiceAgentEditor({ agentId, initial }: { agentId: string; initial: AgentWithUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [calendarUserId, setCalendarUserId] = useState(initial.calendarUserId ?? "");
  const [language, setLanguage] = useState(initial.language);
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const [active, setActive] = useState(initial.active);
  const [workingHours, setWorkingHours] = useState<WorkingHoursFormState>(() =>
    workingHoursJsonToFormState((initial.workingHoursJson as Record<string, string[]>) ?? {}),
  );
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (input: UpdateServiceAgentDraft) =>
      fetchJson<AgentResponse>(`/api/service-agents/${agentId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Service agent updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-service-agent", agentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-service-agents"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => fetchJson(`/api/service-agents/${agentId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Service agent deactivated.");
      router.push("/admin/service-agents");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleSkill(skill: string) {
    setSkills((s) => (s.includes(skill) ? s.filter((x) => x !== skill) : [...s, skill]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = updateServiceAgentInput.safeParse({
      calendarUserId: calendarUserId || null,
      skills,
      language,
      active,
      workingHoursJson: formStateToWorkingHoursJson(workingHours),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    updateMutation.mutate(parsed.data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-sm">{initial.user.name ?? initial.user.email}</span>
          <Badge variant={initial.active ? "default" : "outline"}>{initial.active ? "Active" : "Inactive"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendarUserId">Calendar user ID</Label>
            <Input id="calendarUserId" value={calendarUserId} onChange={(e) => setCalendarUserId(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="language">Language</Label>
            <Input id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="max-w-24" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Skills</Label>
            <div className="flex flex-wrap gap-2">
              {Object.values(ServiceSkill).map((skill) => (
                <Badge key={skill} variant={skills.includes(skill) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleSkill(skill)}>
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
          <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Active
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save
            </Button>
            {initial.active && (
              <Button type="button" variant="outline" onClick={() => deactivateMutation.mutate()} disabled={deactivateMutation.isPending}>
                Deactivate
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
