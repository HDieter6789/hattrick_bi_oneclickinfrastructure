import { describe, expect, it } from "vitest";
// Imported from the pure decision module directly (not
// customer-access-service.ts, which imports @/db/prisma and would require
// a live DATABASE_URL just to load) — see fabric-role-plan.ts's module
// doc for why the security-boundary logic lives there.
import { FABRIC_CUSTOMER_ROLE, groupNameForAccess, planFabricRoleAssignment } from "@/services/entra/fabric-role-plan";
import { CustomerAccessKind } from "@/generated/prisma/enums";

const ALL_KINDS = Object.values(CustomerAccessKind);
const PRINCIPAL_TYPES = ["User", "Group", "ServicePrincipal"] as const;
const FORBIDDEN_ROLES = ["Admin", "Contributor", "Member", "Owner"];

describe("planFabricRoleAssignment — least-privilege security boundary (brief section 24/56)", () => {
  it("never produces a Fabric role assignment other than 'Viewer', for every CustomerAccessKind and every assignable principal type", () => {
    expect(ALL_KINDS.length).toBeGreaterThan(0); // guard against the enum silently losing values

    for (const kind of ALL_KINDS) {
      for (const type of PRINCIPAL_TYPES) {
        const plan = planFabricRoleAssignment(kind, { id: "principal-id", type });

        if (kind === "portal_access") {
          expect(plan).toBeNull();
          continue;
        }

        expect(plan).not.toBeNull();
        expect(plan!.role).toBe("Viewer");
        expect(plan!.role).toBe(FABRIC_CUSTOMER_ROLE);
        for (const forbidden of FORBIDDEN_ROLES) {
          expect(plan!.role).not.toBe(forbidden);
        }
      }
    }
  });

  it("never grants a Fabric-side role for portal_access — it is portal-login only", () => {
    expect(planFabricRoleAssignment("portal_access", { id: "any-principal", type: "User" })).toBeNull();
    expect(planFabricRoleAssignment("portal_access", { id: "any-group", type: "Group" })).toBeNull();
  });

  it("preserves the resolved principal id/type in the plan without ever escalating it", () => {
    const plan = planFabricRoleAssignment("gold_read", { id: "group-123", type: "Group" });
    expect(plan).toEqual({ principalId: "group-123", principalType: "Group", role: "Viewer" });
  });

  it("still yields only 'Viewer' for semantic_model_build, which in a real Fabric tenant would normally need Contributor to author — a deliberate platform constraint, not an oversight", () => {
    const plan = planFabricRoleAssignment("semantic_model_build", { id: "group-bi", type: "Group" });
    expect(plan?.role).toBe("Viewer");
  });
});

describe("groupNameForAccess", () => {
  it("routes report/semantic-model kinds to the -BI group and everything else to -READERS", () => {
    expect(groupNameForAccess("acme", "gold_read")).toBe("CUSTOMER-acme-READERS");
    expect(groupNameForAccess("acme", "sql_read")).toBe("CUSTOMER-acme-READERS");
    expect(groupNameForAccess("acme", "report_view")).toBe("CUSTOMER-acme-BI");
    expect(groupNameForAccess("acme", "semantic_model_build")).toBe("CUSTOMER-acme-BI");
  });
});
