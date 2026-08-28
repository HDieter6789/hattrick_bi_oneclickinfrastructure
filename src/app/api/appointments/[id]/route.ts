import { NextResponse, type NextRequest } from "next/server";
import { cancelAppointment } from "@/features/appointments/service";
import { toApiErrorResponse } from "@/features/appointments/http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const appointment = await cancelAppointment(id);
    return NextResponse.json({ appointment });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
