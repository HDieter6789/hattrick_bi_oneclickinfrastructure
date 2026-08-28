/**
 * Pure customer-status transition rules for the admin portal's "suspend /
 * reactivate" action (PATCH /api/admin/customers/[id]). Deliberately
 * narrow: the admin portal only ever drives `active <-> suspended`
 * (and lets ops suspend a customer stuck in `error`) — every other
 * status (`draft`, `configuration`, `ready_for_deployment`, `deploying`)
 * is owned by the configuration/deployment wizard (Agent D's surface),
 * never by this admin action.
 *
 * Kept free of any `@/db/prisma` or `server-only` import (mirrors
 * services/entra/fabric-role-plan.ts) so it can be unit-tested without a
 * live DATABASE_URL — see tests/unit/customer-access.test.ts's module doc
 * for why that separation matters.
 */

/** Mirrors prisma's `CustomerStatus` enum (prisma/schema/customer.prisma). */
export type CustomerStatusLiteral =
  | "draft"
  | "configuration"
  | "ready_for_deployment"
  | "deploying"
  | "active"
  | "error"
  | "suspended";

const ADMIN_ALLOWED_TRANSITIONS: Record<CustomerStatusLiteral, CustomerStatusLiteral[]> = {
  draft: [],
  configuration: [],
  ready_for_deployment: [],
  deploying: [],
  active: ["suspended"],
  error: ["suspended"],
  suspended: ["active"],
};

/** True when the admin portal's status-change action may move a customer
 * from `current` to `target`. Same-status "transitions" are never allowed
 * (the caller should treat that as a no-op, not a valid PATCH). */
export function canTransitionCustomerStatus(current: CustomerStatusLiteral, target: CustomerStatusLiteral): boolean {
  if (current === target) return false;
  return ADMIN_ALLOWED_TRANSITIONS[current].includes(target);
}

export class InvalidCustomerStatusTransitionError extends Error {
  constructor(current: CustomerStatusLiteral, target: CustomerStatusLiteral) {
    super(`Cannot transition customer status from '${current}' to '${target}' via the admin portal`);
    this.name = "InvalidCustomerStatusTransitionError";
  }
}

/** Throws `InvalidCustomerStatusTransitionError` unless the transition is
 * allowed — the single check both the route handler and its tests exercise. */
export function assertCustomerStatusTransitionAllowed(current: CustomerStatusLiteral, target: CustomerStatusLiteral): void {
  if (!canTransitionCustomerStatus(current, target)) {
    throw new InvalidCustomerStatusTransitionError(current, target);
  }
}
