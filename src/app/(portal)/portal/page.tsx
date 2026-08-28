import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { ServiceStatusBadge } from "@/components/shared/service-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalOverviewPage() {
  const session = await auth();
  const membership = session?.user?.id
    ? await prisma.customerUser.findFirst({
        where: { userId: session.user.id, status: "active" },
        include: { customer: true },
      })
    : null;

  if (!membership) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">No workspace found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn&apos;t linked to a customer workspace yet. Contact your OneClick service agent.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Data Platform</h1>
          <p className="text-sm text-muted-foreground">{membership.customer.companyName}</p>
        </div>
        <ServiceStatusBadge status="GREEN" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Your platform status is <span className="font-medium">{membership.customer.status}</span>. Detailed
            data freshness, SQL access, reports and usage information appear here once your infrastructure has
            been provisioned.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
