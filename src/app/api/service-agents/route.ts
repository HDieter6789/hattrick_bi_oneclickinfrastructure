import { NextResponse, type NextRequest } from "next/server";
import { createServiceAgent, listServiceAgents } from "@/features/appointments/service";
import { toApiErrorResponse } from "@/features/appointments/http";
import type { CreateServiceAgentDraft, ListServiceAgentsQueryDraft } from "@/features/appointments/schemas";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = {
      skill: searchParams.get("skill") ?? undefined,
      language: searchParams.get("language") ?? undefined,
      activeOnly: searchParams.get("activeOnly") === "false" ? false : undefined,
    } as ListServiceAgentsQueryDraft;
    const agents = await listServiceAgents(query);
    return NextResponse.json({ agents });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateServiceAgentDraft;
    const agent = await createServiceAgent(body);
    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
