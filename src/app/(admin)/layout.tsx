import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { isInternalRole } from "@/lib/authz";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Building2,
  Rocket,
  Boxes,
  Layers,
  Users,
  ShieldAlert,
  ScrollText,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/customers", label: "Customers", icon: Building2 },
  { href: "/admin/deployments", label: "Deployments", icon: Rocket },
  { href: "/admin/fabric-registry", label: "Fabric Registry", icon: Boxes },
  { href: "/admin/blueprints", label: "Blueprints", icon: Layers },
  { href: "/admin/service-agents", label: "Service Agents", icon: Users },
  { href: "/admin/alerts", label: "Alerts", icon: ShieldAlert },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (!isInternalRole(session.user.role)) redirect("/portal");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            1C
          </div>
          <span className="text-sm font-semibold">OneClick Admin</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-sidebar-border pt-3">
          <p className="truncate px-2 text-xs text-muted-foreground">{session.user.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <Button variant="ghost" size="sm" className="w-full justify-start" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}
