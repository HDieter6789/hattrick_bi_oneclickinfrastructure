import { toErrorResponse } from "@/lib/api-response";
import { createCustomer, listCustomers } from "@/features/customers/service";

/** GET /api/customers — internal-role-only customer roster (used by the
 * provisioning wizard's Customer step). Auth is enforced inside
 * listCustomers() itself. */
export async function GET(): Promise<Response> {
  try {
    const customers = await listCustomers();
    return Response.json({ customers });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/customers — create a customer in `draft` status. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const customer = await createCustomer(body);
    return Response.json({ customer }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
