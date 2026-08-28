import { describe, expect, it } from "vitest";
import {
  alertSeverityBadgeVariant,
  alertStatusBadgeVariant,
  auditStatusBadgeVariant,
  connectionHealthBadgeVariant,
  connectionStatusBadgeVariant,
  customerStatusBadgeVariant,
  deploymentStatusBadgeVariant,
} from "@/components/admin-portal/badge-variants";
import {
  AlertSeverity,
  AlertStatus,
  AuditStatus,
  ConnectionHealth,
  ConnectionStatus,
  CustomerStatus,
  DeploymentStatus,
} from "@/generated/prisma/enums";

describe("admin portal badge-variant mappings", () => {
  it("maps every CustomerStatus to a variant, with the danger states colored destructive", () => {
    for (const status of Object.values(CustomerStatus)) {
      expect(customerStatusBadgeVariant(status)).toBeTruthy();
    }
    expect(customerStatusBadgeVariant("error")).toBe("destructive");
    expect(customerStatusBadgeVariant("suspended")).toBe("destructive");
    expect(customerStatusBadgeVariant("active")).toBe("default");
  });

  it("maps every AlertSeverity to a variant, critical being the loudest", () => {
    for (const severity of Object.values(AlertSeverity)) {
      expect(alertSeverityBadgeVariant(severity)).toBeTruthy();
    }
    expect(alertSeverityBadgeVariant("critical")).toBe("destructive");
  });

  it("maps every AlertStatus to a variant, open being the loudest", () => {
    for (const status of Object.values(AlertStatus)) {
      expect(alertStatusBadgeVariant(status)).toBeTruthy();
    }
    expect(alertStatusBadgeVariant("open")).toBe("destructive");
    expect(alertStatusBadgeVariant("resolved")).toBe("outline");
  });

  it("maps every DeploymentStatus to a variant", () => {
    for (const status of Object.values(DeploymentStatus)) {
      expect(deploymentStatusBadgeVariant(status)).toBeTruthy();
    }
    expect(deploymentStatusBadgeVariant("succeeded")).toBe("default");
    expect(deploymentStatusBadgeVariant("failed")).toBe("destructive");
    expect(deploymentStatusBadgeVariant("partially_failed")).toBe("destructive");
  });

  it("maps every ConnectionHealth/ConnectionStatus to a variant", () => {
    for (const health of Object.values(ConnectionHealth)) {
      expect(connectionHealthBadgeVariant(health)).toBeTruthy();
    }
    for (const status of Object.values(ConnectionStatus)) {
      expect(connectionStatusBadgeVariant(status)).toBeTruthy();
    }
    expect(connectionHealthBadgeVariant("failed")).toBe("destructive");
  });

  it("maps every AuditStatus to a variant", () => {
    for (const status of Object.values(AuditStatus)) {
      expect(auditStatusBadgeVariant(status)).toBeTruthy();
    }
    expect(auditStatusBadgeVariant("failure")).toBe("destructive");
  });
});
