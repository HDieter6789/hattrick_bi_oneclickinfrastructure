import { toErrorResponse } from "@/lib/api-response";
import { createConfiguration, listConfigurationsForCustomer } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/customers/[id]/configurations — every InfrastructureConfiguration
 * for this customer (internal roles, or the customer's own members via
 * requireCustomerAccess, enforced inside listConfigurationsForCustomer()).
 * Response: `{ configurations: InfrastructureConfiguration[] }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const configurations = await listConfigurationsForCustomer(id);
    return Response.json({ configurations });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/customers/[id]/configurations — creates a draft
 * InfrastructureConfiguration for this customer. Body: `CreateConfigurationDraft`
 * (see src/features/provisioning/schemas.ts's createConfigurationInput).
 * Response: `{ configuration: InfrastructureConfiguration }`, status 201. */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await request.json();
    const configuration = await createConfiguration(id, body);
    return Response.json({ configuration }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
