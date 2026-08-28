import { registerFixedStep } from "./step-registry";
import { runInitialLoadStep } from "./steps/run-initial-load";
import { resolveSqlEndpointStep } from "./steps/resolve-sql-endpoint";

/**
 * Populates step-registry.ts's fixed-step list. Every feature module that
 * adds a fixed (non-resource) provisioning step registers it here, in the
 * order it should run — `registerFixedStep` is a no-op for a stepKey
 * that's already registered, so this module is safe to import more than
 * once (e.g. from both instrumentation.ts and a test file) without
 * duplicating steps.
 *
 * Order matters: `run_initial_load` runs before `resolve_sql_endpoint` so
 * the SQL analytics endpoint reflects loaded data rather than an empty
 * Lakehouse (see resolve-sql-endpoint.ts's doc comment).
 *
 * Something must actually call this before `runDeployment` executes a
 * deployment — see src/instrumentation.ts, which imports this module for
 * its side effect once at server startup.
 */
export function registerIngestionSteps(): void {
  registerFixedStep(runInitialLoadStep);
  registerFixedStep(resolveSqlEndpointStep);
}

registerIngestionSteps();
