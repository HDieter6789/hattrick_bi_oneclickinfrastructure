import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { PortalTabs } from "@/components/portal/portal-tabs";
import type { PortalTabKey } from "@/components/portal/tab-visibility";

/**
 * Shared server-side shell for every `/portal*` page: resolves the signed-in
 * user's own `CustomerUser` membership (never a URL param — a customer must
 * never be able to view another customer's data by editing the address bar)
 * and renders the tabbed portal on top of it. Every `/portal/*` page.tsx is
 * a thin wrapper around this with a different `initialTab`.
 */
export async function PortalPageShell({ initialTab }: { initialTab: PortalTabKey }) {
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your Data Platform</h1>
        <p className="text-sm text-muted-foreground">{membership.customer.companyName}</p>
      </div>
      <PortalTabs customerId={membership.customerId} initialTab={initialTab} />
    </div>
  );
}
