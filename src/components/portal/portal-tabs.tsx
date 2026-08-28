"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJson } from "@/components/shared/fetch-json";
import { getVisiblePortalTabs, PORTAL_TAB_LABELS, PORTAL_TAB_PATHS, type PortalConfigFlags, type PortalTabKey } from "./tab-visibility";
import { OverviewTab } from "./tabs/overview-tab";
import { DataTab } from "./tabs/data-tab";
import { SqlTab } from "./tabs/sql-tab";
import { ReportsTab } from "./tabs/reports-tab";
import { UsageTab } from "./tabs/usage-tab";
import { AppointmentsTab } from "./tabs/appointments-tab";
import { SupportTab } from "./tabs/support-tab";

interface ApiConfiguration extends PortalConfigFlags {
  id: string;
  status: string;
  updatedAt: string;
}

/**
 * The customer portal's tabbed shell (brief: restructure `/portal` into
 * Overview/Data/SQL Access/Reports/Usage/Appointments/Support tabs). One
 * component backs every `/portal*` route — `initialTab` comes from which
 * page.tsx rendered it, and switching tabs pushes the matching URL so deep
 * links/back-forward keep working, rather than hiding all seven behind a
 * single client-only route.
 *
 * `customerId` is derived server-side from the signed-in user's own
 * `CustomerUser` membership (see the (portal) layout/page server
 * components) and passed down as a prop — never read from a URL param a
 * customer could edit to view another customer's data.
 */
export function PortalTabs({ customerId, initialTab }: { customerId: string; initialTab: PortalTabKey }) {
  const router = useRouter();

  // GET /api/portal/[customerId]/overview has no per-configuration feature
  // flags, so tab visibility is derived from this customer's own
  // configurations instead (flagged as a two-call combination in the
  // implementation report).
  const configurationsQuery = useQuery({
    queryKey: ["portal-configurations", customerId],
    queryFn: () => fetchJson<{ configurations: ApiConfiguration[] }>(`/api/customers/${customerId}/configurations`),
  });

  const flags: PortalConfigFlags | null = useMemo(() => {
    const configurations = configurationsQuery.data?.configurations ?? [];
    if (configurations.length === 0) return null;
    const finalized = configurations.filter((c) => c.status === "finalized");
    const latest = [...(finalized.length > 0 ? finalized : configurations)].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
    return {
      sqlSelfServiceEnabled: latest.sqlSelfServiceEnabled,
      semanticModelEnabled: latest.semanticModelEnabled,
      starterReportEnabled: latest.starterReportEnabled,
      usageReportEnabled: latest.usageReportEnabled,
    };
  }, [configurationsQuery.data]);

  const visibleTabs = useMemo(() => getVisiblePortalTabs(flags), [flags]);
  const activeTab = visibleTabs.includes(initialTab) ? initialTab : "overview";

  return (
    <Tabs value={activeTab} onValueChange={(value) => router.push(PORTAL_TAB_PATHS[value as PortalTabKey])} className="gap-6">
      <TabsList>
        {visibleTabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {PORTAL_TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
      </TabsList>

      {visibleTabs.includes("overview") && (
        <TabsContent value="overview">
          <OverviewTab customerId={customerId} />
        </TabsContent>
      )}
      {visibleTabs.includes("data") && (
        <TabsContent value="data">
          <DataTab customerId={customerId} />
        </TabsContent>
      )}
      {visibleTabs.includes("sql") && (
        <TabsContent value="sql">
          <SqlTab customerId={customerId} />
        </TabsContent>
      )}
      {visibleTabs.includes("reports") && (
        <TabsContent value="reports">
          <ReportsTab
            customerId={customerId}
            semanticModelEnabled={flags?.semanticModelEnabled ?? false}
            starterReportEnabled={flags?.starterReportEnabled ?? false}
          />
        </TabsContent>
      )}
      {visibleTabs.includes("usage") && (
        <TabsContent value="usage">
          <UsageTab customerId={customerId} />
        </TabsContent>
      )}
      {visibleTabs.includes("appointments") && (
        <TabsContent value="appointments">
          <AppointmentsTab customerId={customerId} />
        </TabsContent>
      )}
      {visibleTabs.includes("support") && (
        <TabsContent value="support">
          <SupportTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
