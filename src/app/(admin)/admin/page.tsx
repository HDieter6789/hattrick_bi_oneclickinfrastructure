import Link from "next/link";
import { prisma } from "@/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function getDashboardStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeCustomers, deploymentsToday, succeeded, failed, running, upcomingAppointments, openAlerts, criticalOpenAlerts] = await Promise.all([
    prisma.customer.count({ where: { status: "active" } }),
    prisma.deployment.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.deployment.count({ where: { status: "succeeded" } }),
    prisma.deployment.count({ where: { status: { in: ["failed", "partially_failed"] } } }),
    prisma.deployment.count({ where: { status: "running" } }),
    prisma.appointment.count({ where: { status: "confirmed", startTime: { gte: new Date() } } }),
    prisma.alert.count({ where: { status: "open" } }),
    prisma.alert.count({ where: { status: "open", severity: "critical" } }),
  ]);

  return { activeCustomers, deploymentsToday, succeeded, failed, running, upcomingAppointments, openAlerts, criticalOpenAlerts };
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  const tiles = [
    { label: "Active customers", value: stats.activeCustomers },
    { label: "Deployments today", value: stats.deploymentsToday },
    { label: "Successful deployments", value: stats.succeeded },
    { label: "Failed deployments", value: stats.failed },
    { label: "Running deployments", value: stats.running },
    { label: "Upcoming appointments", value: stats.upcomingAppointments },
    { label: "Open alerts", value: stats.openAlerts, href: "/admin/alerts" },
    { label: "Critical open alerts", value: stats.criticalOpenAlerts, href: "/admin/alerts?severity=critical", danger: stats.criticalOpenAlerts > 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform-wide provisioning overview.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
        {tiles.map((tile) => {
          const card = (
            <Card className={tile.danger ? "border-destructive/40" : "border-border"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{tile.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className={tile.danger ? "text-2xl font-semibold tabular-nums text-destructive" : "text-2xl font-semibold tabular-nums"}>
                  {tile.value}
                </span>
              </CardContent>
            </Card>
          );
          return tile.href ? (
            <Link key={tile.label} href={tile.href} className="block">
              {card}
            </Link>
          ) : (
            <div key={tile.label}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
