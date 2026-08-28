import { NextResponse, type NextRequest } from "next/server";
import { confirmAppointment } from "@/features/appointments/service";
import { toApiErrorResponse } from "@/features/appointments/http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const appointment = await confirmAppointment(id);
    return NextResponse.json({ appointment });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
