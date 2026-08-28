import { describe, expect, it } from "vitest";
import {
  assertCustomerStatusTransitionAllowed,
  canTransitionCustomerStatus,
  InvalidCustomerStatusTransitionError,
  type CustomerStatusLiteral,
} from "@/features/admin-portal/pure/customer-status";

const ALL_STATUSES: CustomerStatusLiteral[] = [
  "draft",
  "configuration",
  "ready_for_deployment",
  "deploying",
  "active",
  "error",
  "suspended",
];

describe("canTransitionCustomerStatus — admin suspend/reactivate boundary", () => {
  it("allows active -> suspended and suspended -> active", () => {
    expect(canTransitionCustomerStatus("active", "suspended")).toBe(true);
    expect(canTransitionCustomerStatus("suspended", "active")).toBe(true);
  });

  it("allows suspending a customer stuck in error", () => {
    expect(canTransitionCustomerStatus("error", "suspended")).toBe(true);
  });

  it("never allows a same-status transition", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionCustomerStatus(status, status)).toBe(false);
    }
  });

  it("never allows the admin portal to drive wizard-owned statuses", () => {
    const wizardOwned: CustomerStatusLiteral[] = ["draft", "configuration", "ready_for_deployment", "deploying"];
    for (const from of ALL_STATUSES) {
      for (const to of wizardOwned) {
        if (from === to) continue;
        expect(canTransitionCustomerStatus(from, to)).toBe(false);
      }
    }
  });

  it("rejects any transition out of a wizard-owned status via this action", () => {
    for (const from of ["draft", "configuration", "ready_for_deployment", "deploying"] as CustomerStatusLiteral[]) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue;
        expect(canTransitionCustomerStatus(from, to)).toBe(false);
      }
    }
  });
});

describe("assertCustomerStatusTransitionAllowed", () => {
  it("does not throw for an allowed transition", () => {
    expect(() => assertCustomerStatusTransitionAllowed("active", "suspended")).not.toThrow();
  });

  it("throws InvalidCustomerStatusTransitionError for a disallowed transition", () => {
    expect(() => assertCustomerStatusTransitionAllowed("draft", "active")).toThrow(InvalidCustomerStatusTransitionError);
  });
});
