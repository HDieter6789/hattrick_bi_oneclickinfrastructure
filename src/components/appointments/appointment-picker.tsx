"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Self-contained appointment scheduling widget (brief section 6/49). Not
 * wired into any wizard route itself — it's embedded by the provisioning
 * wizard's Appointment step elsewhere. Talks only to
 * src/app/api/appointments and src/app/api/service-agents, so it has no
 * dependency on server-only code and can be dropped into any client tree.
 *
 * Booking is a two-step flow (see services/calendar/calendar-service.ts
 * for the rationale): picking a slot creates the appointment as
 * "pending"; a separate "Confirm appointment" action makes it
 * "confirmed" — the only state the deployment gate
 * (services/provisioning/preflight.ts) accepts.
 */

type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";

interface ApiAppointment {
  id: string;
  customerId: string;
  serviceAgentId: string | null;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes: string | null;
  serviceAgent?: { user: { name: string | null; email: string } } | null;
}

interface ApiAvailableSlot {
  serviceAgentId: string;
  start: string;
  end: string;
}

interface ApiServiceAgent {
  id: string;
  language: string;
  skills: string[];
}

interface SlotsResponse {
  agent: ApiServiceAgent | null;
  slots: ApiAvailableSlot[];
}

export interface AppointmentPickerProps {
  customerId: string;
  /** Manually pin a specific agent instead of letting the platform
   * auto-assign one (brief section 26). */
  serviceAgentId?: string;
  requiredSkill?: string;
  requiredLanguage?: string;
  className?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request to ${url} failed (${response.status})`);
  }
  return body as T;
}

function formatSlotTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

function formatDayHeading(iso: string): string {
  return format(new Date(iso), "EEEE, MMMM d");
}

export function AppointmentPicker({ customerId, serviceAgentId, requiredSkill, requiredLanguage, className }: AppointmentPickerProps) {
  const queryClient = useQueryClient();
  const [pendingSlot, setPendingSlot] = useState<ApiAvailableSlot | null>(null);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", customerId],
    queryFn: () => fetchJson<{ appointments: ApiAppointment[] }>(`/api/appointments?customerId=${encodeURIComponent(customerId)}`),
  });

  const active = appointmentsQuery.data?.appointments.find((a) => a.status === "pending" || a.status === "confirmed") ?? null;
  const isConfirmed = active?.status === "confirmed";

  const slotsQuery = useQuery({
    queryKey: ["appointment-slots", customerId, serviceAgentId, requiredSkill, requiredLanguage],
    queryFn: () => {
      const params = new URLSearchParams({ customerId });
      if (serviceAgentId) params.set("serviceAgentId", serviceAgentId);
      if (requiredSkill) params.set("requiredSkill", requiredSkill);
      if (requiredLanguage) params.set("requiredLanguage", requiredLanguage);
      return fetchJson<SlotsResponse>(`/api/appointments/slots?${params.toString()}`);
    },
    enabled: !active, // no need to fetch open slots once something is booked
  });

  const bookMutation = useMutation({
    mutationFn: (slot: ApiAvailableSlot) =>
      fetchJson<{ appointment: ApiAppointment }>("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, serviceAgentId: slot.serviceAgentId, startTime: slot.start, endTime: slot.end }),
      }),
    onSuccess: () => {
      toast.success("Time slot booked — confirm it below to finish scheduling.");
      queryClient.invalidateQueries({ queryKey: ["appointments", customerId] });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setPendingSlot(null),
  });

  const confirmMutation = useMutation({
    mutationFn: (appointmentId: string) => fetchJson<{ appointment: ApiAppointment }>(`/api/appointments/${appointmentId}/confirm`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Appointment confirmed.");
      queryClient.invalidateQueries({ queryKey: ["appointments", customerId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (appointmentId: string) => fetchJson<{ appointment: ApiAppointment }>(`/api/appointments/${appointmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Appointment cancelled.");
      queryClient.invalidateQueries({ queryKey: ["appointments", customerId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, ApiAvailableSlot[]>();
    for (const slot of slotsQuery.data?.slots ?? []) {
      const key = new Date(slot.start).toDateString();
      const list = groups.get(key) ?? [];
      list.push(slot);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [slotsQuery.data]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          Service appointment
        </CardTitle>
        <CardDescription>A brief onboarding call with a Fabric specialist before your infrastructure is deployed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!isConfirmed && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>An onboarding/service appointment is required before infrastructure deployment.</span>
          </div>
        )}

        {active ? (
          <div className="flex flex-col gap-3 rounded-lg ring-1 ring-foreground/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{formatDayHeading(active.startTime)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatSlotTime(active.startTime)} – {formatSlotTime(active.endTime)}
                  {active.serviceAgent?.user.name ? ` with ${active.serviceAgent.user.name}` : ""}
                </p>
              </div>
              <Badge variant={isConfirmed ? "default" : "secondary"} className="gap-1">
                {isConfirmed ? <CheckCircle2 className="size-3" /> : null}
                {isConfirmed ? "Confirmed" : "Pending confirmation"}
              </Badge>
            </div>
            <Separator />
            <div className="flex gap-2">
              {!isConfirmed && (
                <Button size="sm" onClick={() => confirmMutation.mutate(active.id)} disabled={confirmMutation.isPending}>
                  {confirmMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Confirm appointment
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(active.id)} disabled={cancelMutation.isPending}>
                {isConfirmed ? "Cancel appointment" : "Choose a different time"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {slotsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading available times…</p>}
            {slotsQuery.isError && <p className="text-sm text-destructive">{(slotsQuery.error as Error).message}</p>}
            {slotsQuery.data && !slotsQuery.data.agent && (
              <p className="text-sm text-muted-foreground">No service agent is currently available for scheduling.</p>
            )}
            {slotsQuery.data?.agent && slotsByDay.length === 0 && (
              <p className="text-sm text-muted-foreground">No open times in the next couple of weeks — please check back soon.</p>
            )}
            {slotsByDay.map(([day, slots]) => (
              <div key={day} className="flex flex-col gap-2">
                <p className="text-sm font-medium">{formatDayHeading(slots[0].start)}</p>
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => {
                    const isBooking = bookMutation.isPending && pendingSlot?.start === slot.start && pendingSlot.serviceAgentId === slot.serviceAgentId;
                    return (
                      <Button
                        key={`${slot.serviceAgentId}-${slot.start}`}
                        size="sm"
                        variant="outline"
                        disabled={bookMutation.isPending}
                        onClick={() => {
                          setPendingSlot(slot);
                          bookMutation.mutate(slot);
                        }}
                        className={cn(isBooking && "opacity-70")}
                      >
                        {isBooking ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {formatSlotTime(slot.start)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
