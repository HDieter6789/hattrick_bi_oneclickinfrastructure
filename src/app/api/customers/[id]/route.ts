import { toErrorResponse } from "@/lib/api-response";
import { getCustomer, updateCustomer } from "@/features/customers/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/customers/[id] — internal roles, or the customer's own members
 * via requireCustomerAccess (enforced inside getCustomer()). */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const customer = await getCustomer(id);
    return Response.json({ customer });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/customers/[id] — internal roles can change anything; a
 * customer's own admins may update contact details but not
 * status/serviceTier/environmentMode (enforced inside updateCustomer()). */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await request.json();
    const customer = await updateCustomer(id, body);
    return Response.json({ customer });
  } catch (error) {
    return toErrorResponse(error);
  }
}
