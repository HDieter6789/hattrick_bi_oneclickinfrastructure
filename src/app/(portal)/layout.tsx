import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/db/prisma";
import { isInternalRole } from "@/lib/authz";
import { Button } from "@/components/ui/button";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // Internal staff land in the customer portal only when explicitly
  // impersonating/reviewing a customer (future work); for now they're
  // routed to /admin, matching middleware's coarse split.
  if (isInternalRole(session.user.role)) redirect("/admin");

  const membership = await prisma.customerUser.findFirst({
    where: { userId: session.user.id, status: "active" },
    include: { customer: true },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              1C
            </div>
            <span className="text-sm font-semibold">
              {membership?.customer.companyName ?? "Your Data Platform"}
            </span>
          </div>
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {[
              { href: "/portal", label: "Overview" },
              { href: "/portal/data", label: "Data" },
              { href: "/portal/sql", label: "SQL Access" },
              { href: "/portal/reports", label: "Reports" },
              { href: "/portal/usage", label: "Usage" },
              { href: "/portal/appointments", label: "Appointments" },
              { href: "/portal/support", label: "Support" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
