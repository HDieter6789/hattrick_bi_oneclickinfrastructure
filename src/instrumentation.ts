/**
 * Next.js instrumentation hook — runs once when the server process starts,
 * before any request is handled (see
 * node_modules/next/dist/docs/app/api-reference/file-conventions/instrumentation.md).
 *
 * Used here only to populate the fixed-step provisioning registry
 * (services/provisioning/step-registry.ts's `fixedSteps`) by importing
 * register-steps.ts for its side effect, so the full fixed-step sequence
 * (run_initial_load -> resolve_sql_endpoint -> health_validation ->
 * access_configuration -> send_welcome_email — see register-steps.ts's
 * `registerFixedProvisioningSteps` for the ordering rationale) is
 * registered before any deployment run happens, regardless of which route
 * ends up invoking `runDeployment`. Guarded to
 * the Node.js runtime since register-steps.ts transitively imports the
 * Prisma client (via the pg driver adapter), which cannot run on the Edge
 * runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/services/provisioning/register-steps");
  }
}
