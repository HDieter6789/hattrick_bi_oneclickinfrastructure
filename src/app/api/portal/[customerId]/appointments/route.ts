import { toErrorResponse } from "@/lib/api-response";
import { listAppointmentsForCustomer } from "@/features/appointments/service";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

/** GET /api/portal/[customerId]/appointments — this customer's service
 * appointments (listAppointmentsForCustomer itself enforces
 * requireCustomerAccess).
 * Response: `{ appointments: (Appointment & { serviceAgent: (ServiceAgent & { user: User }) | null })[] }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { customerId } = await params;
    const appointments = await listAppointmentsForCustomer(customerId);
    return Response.json({ appointments });
  } catch (error) {
    return toErrorResponse(error);
  }
}
