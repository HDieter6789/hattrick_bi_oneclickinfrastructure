import { prisma } from "@/db/prisma";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { getGraphClient } from "@/services/graph";
import { getFabricApiClient } from "@/services/fabric";
import type { CustomerAccess } from "@/generated/prisma/client";
import type { CustomerAccessKind, CustomerAccessPrincipalType } from "@/generated/prisma/enums";
import {
  fabricPrincipalTypeFor,
  planFabricRoleAssignment,
  principalPrefersManagedGroup,
  groupNameForAccess,
  type FabricPrincipalType,
} from "./fabric-role-plan";

const log = childLogger({ module: "entra.customer-access-service" });

/**
 * Least-privilege customer access assignment (brief section 24/56 — a hard
 * security boundary, not just documentation). Customers only ever receive:
 * Gold-read, optional SQL-read, optional report-view, optional
 * semantic-model-build, and portal access — never workspace admin,
 * Bronze/Silver, pipeline, or notebook access.
 *
 * That boundary is enforced structurally, not by convention:
 *  - `CustomerAccessKind` (prisma/schema/access.prisma) is a closed enum
 *    with exactly those five values — there is no "workspace_admin" or
 *    "pipeline_access" kind to even request.
 *  - `planFabricRoleAssignment` (./fabric-role-plan.ts) is the ONLY place
 *    a Fabric workspace/item role assignment is decided, and it hardcodes
 *    `FABRIC_CUSTOMER_ROLE = "Viewer"` — see the regression test in
 *    tests/unit/customer-access.test.ts asserting this never produces
 *    "Admin"/"Contributor"/"Member"/"Owner" for any kind. That module has
 *    no database/Graph/Fabric imports so the test can exercise it without
 *    any live infrastructure — this file re-exports it for convenience.
 *
 * This module is a service-layer primitive analogous to
 * services/fabric/services/graph — it does not call requireAuth/
 * requireRole itself (it has no HTTP/session context; it's also called
 * from non-request contexts like provisioning step executors). Every
 * caller that exposes this over HTTP or a server action MUST wrap it with
 * requireRole("platform_admin", "operations") (customer access is granted
 * by staff, not self-service by the customer) per src/lib/authz.ts.
 */
export { FABRIC_CUSTOMER_ROLE, planFabricRoleAssignment, groupNameForAccess } from "./fabric-role-plan";
export type { FabricRoleAssignmentPlan, FabricPrincipalType } from "./fabric-role-plan";

export type ResolveAccessOptionInput =
  | { principalType: "existing_entra_user"; email: string }
  | { principalType: "guest_invite"; email: string; displayName?: string }
  | { principalType: "internal_user"; userId: string }
  | { principalType: "security_group"; groupName: string };

export interface ResolvedPrincipal {
  principalType: CustomerAccessPrincipalType;
  principalId: string;
  displayName?: string;
  email?: string | null;
}

/**
 * Resolves one of the four external-customer-facing principal options
 * (brief section 24) into a concrete Entra object id.
 * `service_principal` (machine-to-machine) is deliberately not offered
 * here — it doesn't make sense in a customer-facing access wizard; a
 * future admin-only "grant a service principal SQL access" flow could add
 * it without touching this function's shape.
 */
export async function resolveAccessOption(customerId: string, input: ResolveAccessOptionInput): Promise<ResolvedPrincipal> {
  const graph = getGraphClient();
  log.debug({ customerId, principalType: input.principalType }, "Resolving customer access principal");

  switch (input.principalType) {
    case "existing_entra_user": {
      const user = await graph.getUserByEmail(input.email);
      if (!user) throw new Error(`No Microsoft Entra user found for ${input.email}`);
      return { principalType: "existing_entra_user", principalId: user.id, displayName: user.displayName, email: user.mail };
    }
    case "guest_invite": {
      const redirectUrl = `${getEnv().AUTH_URL ?? "http://localhost:3000"}/sign-in`;
      const result = await graph.inviteGuestUser({ email: input.email, displayName: input.displayName, redirectUrl });
      return {
        principalType: "guest_invite",
        principalId: result.invitedUser.id,
        displayName: result.invitedUser.displayName,
        email: result.invitedUser.mail,
      };
    }
    case "internal_user": {
      const user = await prisma.user.findUnique({ where: { id: input.userId } });
      if (!user) throw new Error(`Internal user ${input.userId} not found`);
      if (!user.entraObjectId) throw new Error(`Internal user ${input.userId} has no linked Microsoft Entra account`);
      return { principalType: "internal_user", principalId: user.entraObjectId, displayName: user.name ?? user.email, email: user.email };
    }
    case "security_group": {
      const group = await graph.getSecurityGroupByName(input.groupName);
      if (!group) throw new Error(`Security group "${input.groupName}" not found`);
      return { principalType: "security_group", principalId: group.id, displayName: group.displayName };
    }
  }
}

async function ensureCustomerGroup(graph: ReturnType<typeof getGraphClient>, groupName: string) {
  const existing = await graph.getSecurityGroupByName(groupName);
  if (existing) return existing;
  const mailNickname = groupName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 60);
  return graph.createSecurityGroup(groupName, mailNickname);
}

export interface GrantCustomerAccessParams {
  customerId: string;
  kind: CustomerAccessKind;
  principal: ResolveAccessOptionInput;
  /** Required for every kind except `portal_access`, which has no
   * Fabric-side grant. */
  fabricWorkspaceId?: string;
  fabricItemId?: string;
}

/**
 * Creates the auditable `CustomerAccess` row and, for every kind except
 * `portal_access`, performs the matching Fabric-side grant — always
 * `FABRIC_CUSTOMER_ROLE` ("Viewer"), always preferring a managed security
 * group over an individual role assignment when the principal type
 * supports it. On any failure after the row is created, the row is marked
 * `failed` rather than left `pending` forever, and the error propagates.
 */
export async function grantCustomerAccess(params: GrantCustomerAccessParams): Promise<CustomerAccess> {
  const resolved = await resolveAccessOption(params.customerId, params.principal);

  const access = await prisma.customerAccess.create({
    data: {
      customerId: params.customerId,
      kind: params.kind,
      principalType: resolved.principalType,
      principalId: resolved.principalId,
      fabricWorkspaceId: params.fabricWorkspaceId,
      fabricItemId: params.fabricItemId,
      status: "pending",
    },
  });

  try {
    let assignmentPrincipal: { id: string; type: FabricPrincipalType } = {
      id: resolved.principalId,
      type: fabricPrincipalTypeFor(resolved.principalType),
    };
    let groupName: string | null = null;

    if (params.kind !== "portal_access" && principalPrefersManagedGroup(resolved.principalType)) {
      const graph = getGraphClient();
      groupName = groupNameForAccess(params.customerId, params.kind);
      const group = await ensureCustomerGroup(graph, groupName);
      await graph.addGroupMember(group.id, resolved.principalId);
      assignmentPrincipal = { id: group.id, type: "Group" };
    } else if (resolved.principalType === "security_group") {
      groupName = resolved.displayName ?? null;
    }

    const plan = planFabricRoleAssignment(params.kind, assignmentPrincipal);
    if (plan) {
      if (!params.fabricWorkspaceId) {
        throw new Error(`fabricWorkspaceId is required to grant "${params.kind}" access`);
      }
      const fabric = getFabricApiClient();
      const path = params.fabricItemId
        ? `/workspaces/${params.fabricWorkspaceId}/items/${params.fabricItemId}/roleAssignments`
        : `/workspaces/${params.fabricWorkspaceId}/roleAssignments`;
      await fabric.post(path, { principal: { id: plan.principalId, type: plan.principalType }, role: plan.role });
    }

    const updated = await prisma.customerAccess.update({
      where: { id: access.id },
      data: { status: "granted", grantedAt: new Date(), groupName, fabricRole: plan ? plan.role : null },
    });
    log.info({ customerAccessId: updated.id, customerId: params.customerId, kind: params.kind }, "Customer access granted");
    return updated;
  } catch (error) {
    await prisma.customerAccess.update({ where: { id: access.id }, data: { status: "failed" } });
    log.error({ err: error, customerAccessId: access.id, customerId: params.customerId, kind: params.kind }, "Failed to grant customer access");
    throw error;
  }
}

/** Marks an access grant revoked. Does not (yet) remove the Graph group
 * membership or the Fabric role assignment — the row is the source of
 * truth for "should this principal have access", and a follow-up
 * reconciliation pass can diff CustomerAccess against Fabric/Graph state
 * to clean up externally. Kept out of scope here to avoid silently
 * deleting a group another CustomerAccess row still depends on. */
export async function revokeCustomerAccess(accessId: string): Promise<CustomerAccess> {
  const updated = await prisma.customerAccess.update({
    where: { id: accessId },
    data: { status: "revoked", revokedAt: new Date() },
  });
  log.info({ customerAccessId: accessId }, "Customer access revoked");
  return updated;
}
