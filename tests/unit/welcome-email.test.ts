import { describe, expect, it } from "vitest";
import { buildWelcomeEmail, type WelcomeEmailOptions } from "@/services/mail/templates/welcome-email";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const FORBIDDEN_SUBSTRINGS = ["token", "password", "secret"];

const customer = { companyName: "Contoso Retail GmbH", contactFirstName: "Jamie" };

const minimalOptions: WelcomeEmailOptions = {
  serviceStatus: "Active",
  datasets: [{ name: "Sales Gold" }, { name: "Inventory Gold" }],
  supportEmail: "support@oneclick-fabric.example",
};

const fullOptions: WelcomeEmailOptions = {
  serviceStatus: "Active",
  datasets: [{ name: "Sales Gold" }],
  sql: { server: "contoso-gold.datawarehouse.fabric.microsoft.com", database: "GoldWarehouse" },
  reports: [{ name: "Sales Overview" }],
  dataFreshness: "Most recently refreshed 2026-08-26",
  nextAppointment: { startTime: new Date("2026-09-02T14:00:00Z"), agentName: "Alex Fabric" },
  supportEmail: "support@oneclick-fabric.example",
  supportPhone: "+49 30 1234567",
};

function assertNeverLeaksSecrets(rendered: { subject: string; html: string; text: string }) {
  const combined = `${rendered.subject}\n${rendered.html}\n${rendered.text}`.toLowerCase();
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    expect(combined).not.toContain(forbidden);
  }
  expect(UUID_PATTERN.test(rendered.html)).toBe(false);
  expect(UUID_PATTERN.test(rendered.text)).toBe(false);
}

describe("buildWelcomeEmail — required/excluded content (brief section 27)", () => {
  it("never contains token/password/secret or a UUID-shaped string, with minimal options", () => {
    assertNeverLeaksSecrets(buildWelcomeEmail(customer, minimalOptions));
  });

  it("never contains token/password/secret or a UUID-shaped string, with every optional section enabled", () => {
    assertNeverLeaksSecrets(buildWelcomeEmail(customer, fullOptions));
  });

  it("always includes service status, dataset names, and support info", () => {
    const rendered = buildWelcomeEmail(customer, minimalOptions);
    expect(rendered.text).toContain("Active");
    expect(rendered.text).toContain("Sales Gold");
    expect(rendered.text).toContain("Inventory Gold");
    expect(rendered.text).toContain("support@oneclick-fabric.example");
    expect(rendered.html).toContain("Sales Gold");
  });

  it("omits SQL, reports, and appointment sections when not supplied", () => {
    const rendered = buildWelcomeEmail(customer, minimalOptions);
    expect(rendered.text).not.toContain("SQL self-service access");
    expect(rendered.text).not.toContain("Reports:");
    expect(rendered.text).not.toContain("next service appointment");
  });

  it("includes SQL server/database and Microsoft Entra ID as the auth method when sql is enabled — never a password", () => {
    const rendered = buildWelcomeEmail(customer, fullOptions);
    expect(rendered.text).toContain("contoso-gold.datawarehouse.fabric.microsoft.com");
    expect(rendered.text).toContain("GoldWarehouse");
    expect(rendered.text).toContain("Microsoft Entra ID");
  });

  it("includes report names when reports are enabled", () => {
    const rendered = buildWelcomeEmail(customer, fullOptions);
    expect(rendered.text).toContain("Sales Overview");
    expect(rendered.html).toContain("Sales Overview");
  });

  it("includes data freshness when supplied", () => {
    const rendered = buildWelcomeEmail(customer, fullOptions);
    expect(rendered.text).toContain("2026-08-26");
  });

  it("includes the next service appointment date and agent when supplied", () => {
    const rendered = buildWelcomeEmail(customer, fullOptions);
    expect(rendered.text).toContain("next service appointment");
    expect(rendered.text).toContain("Alex Fabric");
    expect(rendered.text).toContain("2026");
  });

  it("includes support phone when supplied", () => {
    const rendered = buildWelcomeEmail(customer, fullOptions);
    expect(rendered.text).toContain("+49 30 1234567");
  });

  it("HTML-escapes customer-supplied names to prevent markup injection", () => {
    const rendered = buildWelcomeEmail(
      { companyName: "<script>alert(1)</script>", contactFirstName: "Jamie" },
      minimalOptions,
    );
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
  });
});
