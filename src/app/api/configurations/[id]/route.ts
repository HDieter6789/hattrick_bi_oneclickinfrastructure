import { toErrorResponse } from "@/lib/api-response";
import { getConfiguration, updateConfiguration } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/configurations/[id] — one InfrastructureConfiguration, with its
 * blueprint + blueprint resources included. Internal roles, or the owning
 * customer's own members (enforced inside getConfiguration()).
 * Response: `{ configuration: InfrastructureConfiguration & { blueprint: (Blueprint & { resources: BlueprintResource[] }) | null } }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const configuration = await getConfiguration(id);
    return Response.json({ configuration });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/configurations/[id] — updates plain fields, and/or the
 * wizard's per-resource parameter overrides (`resourceParameterOverrides`,
 * persisted via a reserved version-0 ConfigurationVersion row — see
 * src/features/provisioning/service.ts's DRAFT_OVERRIDES_VERSION doc
 * comment). Body: `UpdateConfigurationDraft`.
 * Response: `{ configuration: InfrastructureConfiguration }`. */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await request.json();
    const configuration = await updateConfiguration(id, body);
    return Response.json({ configuration });
  } catch (error) {
    return toErrorResponse(error);
  }
}
