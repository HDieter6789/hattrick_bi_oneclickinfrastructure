"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AppointmentPicker } from "@/components/appointments";
import { fetchJson } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";

interface ApiAppointment {
  id: string;
  status: string;
}

export function StepAppointment({ data, update, goNext, goBack }: WizardStepProps) {
  const appointmentsQuery = useQuery({
    queryKey: ["wizard-appointments", data.customerId],
    queryFn: () => fetchJson<{ appointments: ApiAppointment[] }>(`/api/appointments?customerId=${encodeURIComponent(data.customerId!)}`),
    enabled: Boolean(data.customerId),
    refetchInterval: 5000,
  });

  const active = appointmentsQuery.data?.appointments.find((a) => a.status === "pending" || a.status === "confirmed") ?? null;

  useEffect(() => {
    if (active && (active.id !== data.appointmentId || active.status !== data.appointmentStatus)) {
      update({ appointmentId: active.id, appointmentStatus: active.status });
    }
    if (!active && data.appointmentId) {
      update({ appointmentId: null, appointmentStatus: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appointment</CardTitle>
        <CardDescription>A confirmed onboarding appointment is required before infrastructure can be created.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.customerId && <AppointmentPicker customerId={data.customerId} />}

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" disabled={!active} onClick={goNext}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
