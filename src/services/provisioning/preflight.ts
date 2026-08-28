import { prisma } from "@/db/prisma";
import { isFabricLive, isAppointmentGateSkipped } from "@/lib/env";

export interface PreflightCheck {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
}

/**
 * Server-side validation gate (brief section 32) run before a Deployment
 * is allowed to transition out of `draft`. The appointment check here is
 * the one that MUST be impossible to bypass by calling the deployment API
 * directly (section 25/49) — it is re-derived from the database, never
 * trusted from client input.
 */
export async function runPreflight(deploymentId: string): Promise<PreflightResult> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: {
      appointment: true,
      configuration: { include: { connections: true } },
      customer: true,
      desiredResources: true,
    },
  });

  const checks: PreflightCheck[] = [];

  checks.push({
    key: "appointment_confirmed",
    label: "Service appointment confirmed",
    passed: deployment.appointment.status === "confirmed" || isAppointmentGateSkipped(),
    detail:
      deployment.appointment.status === "confirmed"
        ? undefined
        : isAppointmentGateSkipped()
          ? "SKIP_APPOINTMENT_GATE is set — appointment confirmation was bypassed for testing."
          : "An onboarding/service appointment is required before infrastructure deployment.",
  });

  checks.push({
    key: "desired_resources_present",
    label: "Infrastructure plan generated",
    passed: deployment.desiredResources.length > 0,
    detail: deployment.desiredResources.length > 0 ? undefined : "No resources are planned for this deployment.",
  });

  checks.push({
    key: "customer_contact_email",
    label: "Customer contact email present",
    passed: Boolean(deployment.customer.contactEmail),
  });

  const authenticatedConnections = deployment.configuration.connections.filter((c) => c.status === "connected");
  const totalConnections = deployment.configuration.connections.length;
  checks.push({
    key: "connections_authenticated",
    label: "Data source connections authenticated",
    passed: totalConnections === 0 || authenticatedConnections.length === totalConnections,
    detail:
      totalConnections === 0 || authenticatedConnections.length === totalConnections
        ? undefined
        : `${totalConnections - authenticatedConnections.length} connection(s) are not yet authenticated`,
  });

  checks.push({
    key: "fabric_configuration",
    label: "Fabric tenant/workspace configuration present",
    passed: !isFabricLive() || Boolean(process.env.FABRIC_TENANT_ID),
    detail: !isFabricLive() ? "Running with a mock Fabric client — configuration check skipped" : undefined,
  });

  return { ready: checks.every((c) => c.passed), checks };
}

/** Throws if the deployment is not allowed to start. Every entry point
 * that can start a deployment (server action AND the internal job runner)
 * must call this — the appointment gate cannot be bypassed by calling a
 * different code path. */
export async function assertDeploymentReadyToStart(deploymentId: string): Promise<void> {
  const result = await runPreflight(deploymentId);
  if (!result.ready) {
    const failed = result.checks.filter((c) => !c.passed).map((c) => c.label);
    throw new Error(`Deployment is not ready to start: ${failed.join("; ")}`);
  }
}
