import { registerFixedStep } from "./step-registry";
import { runInitialLoadStep } from "./steps/run-initial-load";
import { resolveSqlEndpointStep } from "./steps/resolve-sql-endpoint";
import { healthValidationStep } from "./steps/health-validation";
import { accessConfigurationStep } from "./steps/access-configuration";
import { sendWelcomeEmailStep } from "./steps/send-welcome-email";

/**
 * Populates step-registry.ts's fixed-step list. Every feature module that
 * adds a fixed (non-resource) provisioning step registers it here, in the
 * order it should run — `registerFixedStep` is a no-op for a stepKey
 * that's already registered, so this module is safe to import more than
 * once (e.g. from both instrumentation.ts and a test file) without
 * duplicating steps.
 *
 * Full fixed-step order and why (every constraint below is satisfied by
 * this single linear order):
 *
 *   1. run_initial_load       — must run before resolve_sql_endpoint so the
 *      SQL analytics endpoint reflects loaded data rather than an empty
 *      Lakehouse (see resolve-sql-endpoint.ts's doc comment). It must also
 *      run before health_validation: validating "is this deployment
 *      healthy" is only meaningful once ingestion has had a chance to run,
 *      otherwise health validation would just be re-checking resource
 *      creation state that hasn't changed since the resource steps ran.
 *   2. resolve_sql_endpoint   — depends on run_initial_load (above); must
 *      run before health_validation because health validation explicitly
 *      checks resolved SqlEndpoint rows for a "Failed" provisioningStatus
 *      (see health-validation.ts) — that check is meaningless if the
 *      endpoint hasn't been resolved yet this run.
 *   3. health_validation      — the explicit, auditable checkpoint (brief
 *      section 27's "Health Validation" phase) that must run after all
 *      ingestion/SQL-endpoint work above so it is validating the deployment
 *      in its final state, and before access_configuration/
 *      send_welcome_email below so an unhealthy deployment never reaches
 *      either of those customer-facing actions.
 *   4. access_configuration   — must run after health_validation (don't
 *      grant a customer access to infrastructure that isn't actually
 *      healthy) and before send_welcome_email (the welcome email should
 *      describe access that has actually been configured).
 *   5. send_welcome_email     — last: per the brief's required ordering
 *      (Deployment -> Health Validation -> Access Configuration ->
 *      Appointment confirmed -> Welcome Email — appointment-confirmed is
 *      already guaranteed by createDeployment's preflight gate long before
 *      any of these fixed steps run, see src/features/provisioning/service.ts),
 *      the customer should never be emailed about a deployment before its
 *      health is verified and its access is granted.
 *
 * Something must actually call registerFixedProvisioningSteps() before
 * `runDeployment` executes a deployment — see src/instrumentation.ts, which
 * imports this module for its side effect once at server startup.
 */
export function registerFixedProvisioningSteps(): void {
  registerFixedStep(runInitialLoadStep);
  registerFixedStep(resolveSqlEndpointStep);
  registerFixedStep(healthValidationStep);
  registerFixedStep(accessConfigurationStep);
  registerFixedStep(sendWelcomeEmailStep);
}

registerFixedProvisioningSteps();
