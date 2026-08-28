import { NextResponse, type NextRequest } from "next/server";
import { getAvailableSlotsForCustomer } from "@/features/appointments/service";
import { toApiErrorResponse } from "@/features/appointments/http";
import type { AvailableSlotsQueryDraft } from "@/features/appointments/schemas";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId query parameter is required" }, { status: 400 });
    }
    const query = {
      customerId,
      serviceAgentId: searchParams.get("serviceAgentId") ?? undefined,
      requiredSkill: searchParams.get("requiredSkill") ?? undefined,
      requiredLanguage: searchParams.get("requiredLanguage") ?? undefined,
    } as AvailableSlotsQueryDraft;

    const result = await getAvailableSlotsForCustomer(query);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
