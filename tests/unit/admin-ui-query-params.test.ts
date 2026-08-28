import { describe, expect, it } from "vitest";
import { buildQueryString } from "@/components/admin-portal/query-params";

describe("buildQueryString", () => {
  it("returns an empty string when every value is omitted", () => {
    expect(buildQueryString({})).toBe("");
    expect(buildQueryString({ a: undefined, b: null, c: "" })).toBe("");
    expect(buildQueryString({ c: "   " })).toBe("");
  });

  it("includes only the supplied, non-empty values", () => {
    expect(buildQueryString({ status: "open", page: 2 })).toBe("?status=open&page=2");
  });

  it("keeps meaningful falsy values (0, false)", () => {
    expect(buildQueryString({ page: 0, enabledOnly: false })).toBe("?page=0&enabledOnly=false");
  });

  it("omits only the values that are actually missing, keeping the rest", () => {
    expect(buildQueryString({ status: undefined, severity: "critical", customerId: "" })).toBe("?severity=critical");
  });

  it("URL-encodes values that need it", () => {
    expect(buildQueryString({ search: "a b&c" })).toBe("?search=a+b%26c");
  });
});
