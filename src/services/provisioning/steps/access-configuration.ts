import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { grantCustomerAccess } from "@/services/entra/customer-access-service";
import type { StepExecutionContext, StepExecutor, StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.access-configuration" });

/**
 * Fixed step that grants the platform's least-privilege customer access
 * (brief section 24/56) once a deployment's infrastructure is healthy
 * (registered to run after `health_validation`, before `send_welcome_email`
 * — see register-steps.ts).
 *
 * For every `CustomerUser` belonging to the deployment's customer, grants:
 *   - `portal_access` (always) — customer portal login, no Fabric-side
 *     grant (see `GrantCustomerAccessParams` doc comment).
 *   - `sql_read` (only when `InfrastructureConfiguration.sqlSelfServiceEnabled`)
 *     — scoped to the deployment's Gold Lakehouse workspace/item, resolved
 *     the same way resolve-sql-endpoint.ts finds it (the "gold" layer
 *     Lakehouse `DesiredResource`'s `ActualResource`).
 *
 * Idempotency: `grantCustomerAccess` always creates a fresh, auditable
 * `CustomerAccess` row rather than being idempotent itself, so idempotency
 * is this step's responsibility. We key it on the resolved Entra principal
 * id (`User.entraObjectId`) rather than on `CustomerUser.id`, because
 * `CustomerAccess.principalId` — not any local join-table id — is the
 * actual thing that must never be granted twice; this stays correct even
 * if a `CustomerUser` row were ever deleted and re-created for the same
 * person. A `granted` `CustomerAccess` row of the matching `kind` with
 * `principalId === user.entraObjectId` means "already done".
 *
 * Design decision — partial failure is non-fatal: resolving a principal
 * can fail per-user (e.g. `CustomerUser.user` has no linked
 * `entraObjectId` yet, or `resolveAccessOption` throws for some other
 * reason), and one bad user record should not block every other user in
 * the same customer from getting access, nor should it block the rest of
 * the deployment (Welcome Email) from proceeding. So a per-user/per-kind
 * grant failure is logged as a warning and the step continues; the whole
 * step is only reported `failed` if EVERY user for whom we attempted a
 * grant ended up with no successful (or already-granted) `portal_access`
 * grant. `portal_access` is treated as the "did this user get access at
 * all" signal because it's the one grant every user needs unconditionally;
 * an optional `sql_read` failure alongside a successful `portal_access`
 * grant is logged but does not count against that all-failed check.
 */
export const accessConfigurationStep: StepExecutor = {
  stepKey: "access_configuration",
  name: "Configure customer access",

  async execute({ deployment }: StepExecutionContext): Promise<StepResult> {
    const customerUsers = await prisma.customerUser.findMany({
      where: { customerId: deployment.customerId },
      include: { user: true },
    });

    if (customerUsers.length === 0) {
      log.info(
        { deploymentId: deployment.id, customerId: deployment.customerId },
        "No customer users to grant access to yet — skipping access configuration",
      );
      return { outcome: "skipped" };
    }

    const configuration = await prisma.infrastructureConfiguration.findUniqueOrThrow({
      where: { id: deployment.infrastructureConfigurationId },
    });

    let sqlFabricWorkspaceId: string | undefined;
    let sqlFabricItemId: string | undefined;

    if (configuration.sqlSelfServiceEnabled) {
      const goldLakehouse = await prisma.desiredResource.findFirst({
        where: { deploymentId: deployment.id, layer: "gold", type: "Lakehouse" },
        include: { actualResource: true },
      });

      if (goldLakehouse?.actualResource) {
        sqlFabricWorkspaceId = goldLakehouse.actualResource.fabricWorkspaceId;
        sqlFabricItemId = goldLakehouse.actualResource.fabricItemId;
      } else {
        log.warn(
          { deploymentId: deployment.id },
          "SQL self-service is enabled but no Gold Lakehouse ActualResource was found — sql_read grants will be skipped this run",
        );
      }
    }

    let usersWithAccess = 0;
    const failures: string[] = [];

    for (const customerUser of customerUsers) {
      const { user } = customerUser;

      if (!user.entraObjectId) {
        // Same condition resolveAccessOption's "internal_user" branch would
        // throw on — checked up front here because the idempotency lookup
        // below needs a principalId to key on anyway.
        const message = `user ${user.id} has no linked Microsoft Entra account`;
        log.warn({ customerId: deployment.customerId, userId: user.id }, `Cannot resolve access principal — ${message}`);
        failures.push(`portal_access for ${message}`);
        continue;
      }

      let portalGranted = false;

      const existingPortalGrant = await prisma.customerAccess.findFirst({
        where: {
          customerId: deployment.customerId,
          kind: "portal_access",
          status: "granted",
          principalId: user.entraObjectId,
        },
      });

      if (existingPortalGrant) {
        log.info({ customerId: deployment.customerId, userId: user.id }, "Portal access already granted — skipping");
        portalGranted = true;
      } else {
        try {
          await grantCustomerAccess({
            customerId: deployment.customerId,
            kind: "portal_access",
            principal: { principalType: "internal_user", userId: user.id },
          });
          portalGranted = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log.warn(
            { customerId: deployment.customerId, userId: user.id, error: message },
            "Failed to grant portal access for this user — continuing with remaining users",
          );
          failures.push(`portal_access for user ${user.id}: ${message}`);
        }
      }

      if (sqlFabricWorkspaceId && sqlFabricItemId) {
        const existingSqlGrant = await prisma.customerAccess.findFirst({
          where: {
            customerId: deployment.customerId,
            kind: "sql_read",
            status: "granted",
            principalId: user.entraObjectId,
          },
        });

        if (existingSqlGrant) {
          log.info({ customerId: deployment.customerId, userId: user.id }, "SQL read access already granted — skipping");
        } else {
          try {
            await grantCustomerAccess({
              customerId: deployment.customerId,
              kind: "sql_read",
              principal: { principalType: "internal_user", userId: user.id },
              fabricWorkspaceId: sqlFabricWorkspaceId,
              fabricItemId: sqlFabricItemId,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            log.warn(
              { customerId: deployment.customerId, userId: user.id, error: message },
              "Failed to grant SQL read access for this user — continuing",
            );
            failures.push(`sql_read for user ${user.id}: ${message}`);
          }
        }
      }

      if (portalGranted) usersWithAccess += 1;
    }

    if (usersWithAccess === 0) {
      return {
        outcome: "failed",
        errorCode: "ACCESS_CONFIGURATION_FAILED",
        errorMessage: `Failed to grant access for every customer user (${customerUsers.length}): ${failures.join("; ")}`,
      };
    }

    if (failures.length > 0) {
      log.warn(
        { deploymentId: deployment.id, customerId: deployment.customerId, failures },
        "Access configuration completed with some partial, non-fatal failures",
      );
    }

    log.info(
      { deploymentId: deployment.id, customerId: deployment.customerId, usersWithAccess, totalUsers: customerUsers.length },
      "Access configuration finished",
    );
    return { outcome: "succeeded" };
  },
};
