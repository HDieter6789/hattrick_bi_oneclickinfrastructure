import type { CustomerAccessKind } from "@/generated/prisma/enums";

/**
 * The pure decision core of the least-privilege customer access boundary
 * (brief section 24/56). Deliberately has NO import of `@/db/prisma`,
 * `@/services/graph`, or `@/services/fabric` — it's imported directly by
 * tests/unit/customer-access.test.ts (a genuine regression guard, not
 * decorative) and must stay import-safe without a database or Entra app
 * registration configured. services/entra/customer-access-service.ts
 * re-exports everything here and builds the actual orchestration
 * (Graph/Fabric calls, CustomerAccess persistence) around it.
 */

/** Fabric's role-assignment principal type for `POST
 * /v1/workspaces/{id}/roleAssignments`. */
export type FabricPrincipalType = "User" | "Group" | "ServicePrincipal";

export const FABRIC_CUSTOMER_ROLE = "Viewer" as const;

export interface FabricRoleAssignmentPlan {
  principalId: string;
  principalType: FabricPrincipalType;
  role: typeof FABRIC_CUSTOMER_ROLE;
}

/**
 * Given a CustomerAccessKind and the principal a Fabric role assignment
 * would target, decides whether an assignment should be made at all, and
 * if so, its exact shape. `portal_access` never produces a Fabric-side
 * grant (it's purely "may sign into the customer portal"). Every other
 * kind produces an assignment with `role` hardcoded to "Viewer" —
 * including `semantic_model_build`, which in a real Fabric tenant would
 * typically need Contributor to author a semantic model; this platform
 * deliberately does not grant that to customer principals yet (see the
 * final report's deviation note) — "build" today means "request us to
 * build it for you", not open self-service authoring.
 */
export function planFabricRoleAssignment(
  kind: CustomerAccessKind,
  assignmentPrincipal: { id: string; type: FabricPrincipalType },
): FabricRoleAssignmentPlan | null {
  if (kind === "portal_access") return null;
  return { principalId: assignmentPrincipal.id, principalType: assignmentPrincipal.type, role: FABRIC_CUSTOMER_ROLE };
}

/** Managed security-group naming convention (brief section 24):
 * `CUSTOMER-{customerId}-READERS` for Gold/SQL read access,
 * `CUSTOMER-{customerId}-BI` for report/semantic-model access. */
export function groupNameForAccess(customerId: string, kind: CustomerAccessKind): string {
  const suffix = kind === "report_view" || kind === "semantic_model_build" ? "BI" : "READERS";
  return `CUSTOMER-${customerId}-${suffix}`;
}

/** Individual principals (users, guests) are added to our managed group
 * rather than getting an individual Fabric role assignment — "prefer
 * groups" per brief section 24. A `security_group` principal IS already a
 * group, so it's granted directly rather than nested inside another one. */
export function principalPrefersManagedGroup(principalType: string): boolean {
  return principalType === "existing_entra_user" || principalType === "guest_invite" || principalType === "internal_user";
}

export function fabricPrincipalTypeFor(principalType: string): FabricPrincipalType {
  if (principalType === "security_group") return "Group";
  if (principalType === "service_principal") return "ServicePrincipal";
  return "User";
}
