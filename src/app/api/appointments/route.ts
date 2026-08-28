import { NextResponse, type NextRequest } from "next/server";
import { bookAppointment, listAppointmentsForCustomer } from "@/features/appointments/service";
import { toApiErrorResponse } from "@/features/appointments/http";
import type { BookAppointmentDraft } from "@/features/appointments/schemas";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId query parameter is required" }, { status: 400 });
    }
    const appointments = await listAppointmentsForCustomer(customerId);
    return NextResponse.json({ appointments });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BookAppointmentDraft;
    const appointment = await bookAppointment(body);
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
