"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fetchJson, jsonHeaders } from "@/components/admin-portal/api";
import { createServiceAgentInput, type CreateServiceAgentDraft } from "@/features/appointments/schemas";
import { ServiceSkill } from "@/generated/prisma/enums";
import { emptyWorkingHours, formStateToWorkingHoursJson, WorkingHoursEditor, type WorkingHoursFormState } from "../_working-hours-editor";
import type { ServiceAgent } from "@/generated/prisma/client";

interface AgentResponse {
  agent: ServiceAgent;
}

export default function NewServiceAgentPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [calendarUserId, setCalendarUserId] = useState("");
  const [language, setLanguage] = useState("en");
  const [skills, setSkills] = useState<string[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHoursFormState>(emptyWorkingHours());
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: CreateServiceAgentDraft) => fetchJson<AgentResponse>("/api/service-agents", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) }),
    onSuccess: (body) => {
      toast.success("Service agent created.");
      router.push(`/admin/service-agents/${body.agent.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleSkill(skill: string) {
    setSkills((s) => (s.includes(skill) ? s.filter((x) => x !== skill) : [...s, skill]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createServiceAgentInput.safeParse({
      userId,
      calendarUserId: calendarUserId || undefined,
      skills,
      language,
      workingHoursJson: formStateToWorkingHoursJson(workingHours),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    createMutation.mutate(parsed.data);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/admin/service-agents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to service agents
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>New service agent</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userId">User ID</Label>
              <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="cuid of an existing platform User" />
              <p className="text-xs text-muted-foreground">No user picker exists yet — paste the internal user&apos;s id directly.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="calendarUserId">Calendar user ID (optional)</Label>
              <Input id="calendarUserId" value={calendarUserId} onChange={(e) => setCalendarUserId(e.target.value)} placeholder="Entra userPrincipalName" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <Input id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="max-w-24" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Skills</Label>
              <div className="flex flex-wrap gap-2">
                {Object.values(ServiceSkill).map((skill) => (
                  <Badge
                    key={skill}
                    variant={skills.includes(skill) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleSkill(skill)}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
            <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Create agent
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
