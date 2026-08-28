import { describe, expect, it } from "vitest";
import { buildSqlAccessSummary } from "@/services/sql-access/sql-access-summary";

describe("buildSqlAccessSummary", () => {
  const input = { server: "xyz.datawarehouse.fabric.microsoft.com", database: "contoso_prod_gld_lh" };

  it("returns the exact required fields", () => {
    const summary = buildSqlAccessSummary(input);
    expect(summary).toEqual({
      server: input.server,
      database: input.database,
      authMethod: "Microsoft Entra ID",
      readOnlyNotice: expect.any(String),
      exampleQuery: "SELECT TOP 100 *\nFROM dbo.<example_table>;",
    });
  });

  it("passes through server and database verbatim", () => {
    const summary = buildSqlAccessSummary(input);
    expect(summary.server).toBe(input.server);
    expect(summary.database).toBe(input.database);
  });

  it("always labels the auth method Microsoft Entra ID", () => {
    const summary = buildSqlAccessSummary(input);
    expect(summary.authMethod).toBe("Microsoft Entra ID");
  });

  it("never includes a password, secret, or raw connection string field", () => {
    const summary = buildSqlAccessSummary(input);
    const keys = Object.keys(summary);
    expect(keys).not.toContain("password");
    expect(keys).not.toContain("secret");
    expect(keys).not.toContain("connectionString");
    // The read-only notice legitimately reassures the customer that no
    // password is required (Entra ID only) — that's expected copy, not a
    // leaked credential. What must never appear is an actual secret value.
    expect(JSON.stringify(summary)).not.toMatch(/[A-Za-z0-9+/]{20,}={0,2}/); // no base64-ish opaque secret blob
  });

  it("produces the exact example query from the brief", () => {
    const summary = buildSqlAccessSummary(input);
    expect(summary.exampleQuery).toBe("SELECT TOP 100 *\nFROM dbo.<example_table>;");
  });
});
