import { NextResponse, type NextRequest } from "next/server";
import { deactivateServiceAgent, updateServiceAgent } from "@/features/appointments/service";
import { toApiErrorResponse } from "@/features/appointments/http";
import type { UpdateServiceAgentDraft } from "@/features/appointments/schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateServiceAgentDraft;
    const agent = await updateServiceAgent(id, body);
    return NextResponse.json({ agent });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const agent = await deactivateServiceAgent(id);
    return NextResponse.json({ agent });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
