import { describe, expect, it } from "vitest";
import { getVisiblePortalTabs, PORTAL_TAB_KEYS, PORTAL_TAB_LABELS, PORTAL_TAB_PATHS } from "@/components/portal/tab-visibility";

const ALL_DISABLED = {
  sqlSelfServiceEnabled: false,
  semanticModelEnabled: false,
  starterReportEnabled: false,
  usageReportEnabled: false,
};

describe("getVisiblePortalTabs", () => {
  it("always shows overview/data/appointments/support, even with no configuration", () => {
    const tabs = getVisiblePortalTabs(null);
    expect(tabs).toEqual(["overview", "data", "appointments", "support"]);
  });

  it("always shows the always-on tabs even when every optional feature is disabled", () => {
    const tabs = getVisiblePortalTabs(ALL_DISABLED);
    expect(tabs).toEqual(["overview", "data", "appointments", "support"]);
  });

  it("shows sql only when sqlSelfServiceEnabled", () => {
    const tabs = getVisiblePortalTabs({ ...ALL_DISABLED, sqlSelfServiceEnabled: true });
    expect(tabs).toContain("sql");
  });

  it("shows reports when either semanticModelEnabled or starterReportEnabled is set", () => {
    expect(getVisiblePortalTabs({ ...ALL_DISABLED, semanticModelEnabled: true })).toContain("reports");
    expect(getVisiblePortalTabs({ ...ALL_DISABLED, starterReportEnabled: true })).toContain("reports");
    expect(getVisiblePortalTabs(ALL_DISABLED)).not.toContain("reports");
  });

  it("shows usage only when usageReportEnabled", () => {
    expect(getVisiblePortalTabs({ ...ALL_DISABLED, usageReportEnabled: true })).toContain("usage");
    expect(getVisiblePortalTabs(ALL_DISABLED)).not.toContain("usage");
  });

  it("shows every tab when every feature is enabled, always-on tabs last (appointments, support)", () => {
    const tabs = getVisiblePortalTabs({
      sqlSelfServiceEnabled: true,
      semanticModelEnabled: true,
      starterReportEnabled: true,
      usageReportEnabled: true,
    });
    expect(tabs).toEqual(["overview", "data", "sql", "reports", "usage", "appointments", "support"]);
  });
});

describe("PORTAL_TAB_LABELS / PORTAL_TAB_PATHS", () => {
  it("define a label and a path for every tab key", () => {
    for (const key of PORTAL_TAB_KEYS) {
      expect(PORTAL_TAB_LABELS[key]).toBeTruthy();
      expect(PORTAL_TAB_PATHS[key]).toBeTruthy();
    }
  });

  it("routes overview to the bare /portal path", () => {
    expect(PORTAL_TAB_PATHS.overview).toBe("/portal");
  });
});
