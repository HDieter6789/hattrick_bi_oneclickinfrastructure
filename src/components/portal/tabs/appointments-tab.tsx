"use client";

import { AppointmentPicker } from "@/components/appointments";

export function AppointmentsTab({ customerId }: { customerId: string }) {
  return <AppointmentPicker customerId={customerId} className="max-w-xl" />;
}
