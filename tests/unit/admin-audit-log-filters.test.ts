import { describe, expect, it } from "vitest";
import { buildAuditLogWhere } from "@/features/admin-portal/pure/audit-log-filters";

describe("buildAuditLogWhere", () => {
  it("returns an empty where clause when no filters are supplied", () => {
    expect(buildAuditLogWhere({})).toEqual({});
  });

  it("includes only the scalar filters that were actually supplied", () => {
    expect(buildAuditLogWhere({ userId: "u1" })).toEqual({ userId: "u1" });
    expect(buildAuditLogWhere({ customerId: "c1", action: "blueprint.update" })).toEqual({
      customerId: "c1",
      action: "blueprint.update",
    });
  });

  it("never includes an empty-string filter as if it were supplied", () => {
    expect(buildAuditLogWhere({ userId: "", action: "" })).toEqual({});
  });

  it("builds a createdAt range from from/to independently", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-02-01T00:00:00Z");

    expect(buildAuditLogWhere({ from })).toEqual({ createdAt: { gte: from } });
    expect(buildAuditLogWhere({ to })).toEqual({ createdAt: { lte: to } });
    expect(buildAuditLogWhere({ from, to })).toEqual({ createdAt: { gte: from, lte: to } });
  });

  it("combines every filter kind together", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const result = buildAuditLogWhere({
      userId: "u1",
      customerId: "c1",
      deploymentId: "d1",
      action: "deployment.create",
      status: "failure",
      from,
    });
    expect(result).toEqual({
      userId: "u1",
      customerId: "c1",
      deploymentId: "d1",
      action: "deployment.create",
      status: "failure",
      createdAt: { gte: from },
    });
  });
});
