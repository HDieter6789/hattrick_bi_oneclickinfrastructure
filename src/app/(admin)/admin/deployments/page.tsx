import Link from "next/link";
import { prisma } from "@/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { deploymentStatusBadgeVariant } from "@/components/admin-portal/badge-variants";

/** Deployments index — a minimal listing (not spelled out in the task
 * brief, but the admin nav already links here) so "Deployments" isn't a
 * dead nav item: every Deployment with its customer, newest first, plus a
 * "New Deployment" entry point into the wizard. */
export default async function DeploymentsIndexPage() {
  const deployments = await prisma.deployment.findMany({
    include: { customer: { select: { companyName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
          <p className="text-sm text-muted-foreground">Every provisioning run, across every customer.</p>
        </div>
        <Button asChild>
          <Link href="/admin/deployments/new">
            <Plus className="size-4" />
            New Deployment
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {deployments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No deployments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deployments.map((deployment) => (
                  <TableRow key={deployment.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/admin/deployments/${deployment.id}`} className="font-medium hover:underline">
                        {deployment.customer.companyName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={deploymentStatusBadgeVariant(deployment.status)}>{deployment.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deployment.startedAt ? new Date(deployment.startedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deployment.finishedAt ? new Date(deployment.finishedAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
