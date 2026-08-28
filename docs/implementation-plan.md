# Implementation Plan — OneClick Fabric Infrastructure

## Repository state at start

The repository (`HDieter6789/hattrick_bi_oneclickinfrastructure`) was empty. There was no
existing architecture, code, or configuration to reuse. This plan documents the ground-up
build from that empty state.

## Product framing

This is a **Fabric provisioning control plane**, not a CRUD app:

```
Desired Infrastructure → Validation → Deployment Plan → Dependency Graph
  → Provisioning Workflow → {Fabric REST API, Microsoft Graph, Connection APIs}
  → Actual Infrastructure → Validation → Managed Customer Access
```

Every phase below is designed around that pipeline. The non-negotiable architectural
pieces (explicitly called out as mandatory in the brief) are the spine everything else
hangs off:

- **Fabric Capability Registry** — DB-driven inventory of what can be provisioned. No
  Fabric item type is ever hardcoded into a React component.
- **Dynamic Parameter Engine** — one generic form renderer driven by
  `FabricParameterSchema` rows, not one form component per item type.
- **Desired State Resource Model** (`DesiredResource`/`ActualResource`) — the
  provisioning engine never talks to raw Fabric payloads directly; it reconciles desired
  vs. actual state, which is what makes idempotency and retry possible.
- **Dependency Graph / DAG** — topological ordering + cycle detection before any
  deployment plan is shown or executed.
- **Provisioning Engine as a durable job abstraction** — Postgres-backed today, designed
  so the execution backend (Temporal, Trigger.dev, ...) can be swapped later without
  touching the domain model.
- **Mandatory appointment gate** — enforced both in the UI (button stays disabled) and
  server-side (the deployment-create endpoint independently checks
  `appointment.status === "confirmed"`; it cannot be bypassed by calling the API
  directly).
- **Customer access boundary** — customers get Gold-only read access, optional SQL/report
  access, and portal access. Never workspace admin, Bronze/Silver, pipelines, notebooks,
  connections, or secrets. This is enforced in the `CustomerAccess` model and the
  permission-assignment service, not just documented as a policy.

## Microsoft Fabric API grounding

Before implementing adapters, the current Fabric REST API surface was researched against
live `learn.microsoft.com` documentation (not training-data memory — Fabric's API surface
changes frequently). Key findings that shaped the design, full detail in
[`FABRIC_API.md`](./FABRIC_API.md):

- The generic Items API (`POST /v1/workspaces/{id}/items`) documents ~50 `ItemType`
  values today, growing over time — confirming the registry-driven approach rather than
  a fixed enum baked into the app.
- Per-type CRUD/definition/creationPayload support genuinely varies (e.g. Dashboard,
  Datamart, MirroredWarehouse and SQLEndpoint have **no create API** — list-only). The
  registry must be able to represent "not supported" per capability, and the UI must
  show that honestly (section 53 of the brief: never fake support).
- LRO handling: 202 + `Location`/`Retry-After`/`x-ms-operation-id` headers, poll
  `GET /v1/operations/{id}` → `NotStarted|Running|Succeeded|Failed`, then fetch
  `/result`. Rate limiting is per-identity, 200 calls/min across three independent
  buckets (Platform/Job Scheduler/LRO APIs), with a `RequestBlocked` vs.
  `CapacityLimitExceeded` distinction in 429 responses that changes retry strategy.
- `GET /v1/connections/supportedConnectionTypes` is a real, runtime-queryable connector
  catalog with typed parameters and supported credential types per connector — this is
  why the Connection Hub syncs from Fabric instead of hand-maintaining connector cards.
- A Lakehouse's SQL Analytics Endpoint (server/database/connection string) is available
  via `GET .../lakehouses/{id}` → `properties.sqlEndpointProperties`, including a
  `provisioningStatus` that must be polled since it provisions asynchronously after the
  Lakehouse itself is created.
- **Critical security-design finding:** there is no supported, cross-customer-safe REST
  API for granular per-workspace capacity consumption. The only granular data lives in
  the Fabric Capacity Metrics semantic model, which Microsoft explicitly documents as
  **unsupported for external querying**. This confirms the brief's instruction to never
  expose the Capacity Metrics app directly — the Customer Usage Report must be built from
  workspace/item-scoped Admin API data the platform already isolates per customer
  (one workspace set per customer), not from querying a shared capacity's metrics.

## Phases

Phases below map to the brief's recommended breakdown. Each phase ends with
`tsc --noEmit`, `next lint`, and the relevant test suite passing before moving on.

| Phase | Scope | Primary output |
|---|---|---|
| 1 | Foundation: Next.js/Tailwind/shadcn shell, Prisma schema (all 25 models across 11 files under `prisma/schema/`), Auth.js + Entra ID provider, role-based route guards, app shell nav | Buildable app, working sign-in with a demo credentials fallback in dev mode |
| 2 | Fabric API client abstraction, Capability Registry service + seed data, Dynamic Parameter Engine, generic form renderer, JSON preview | `FabricApiClient` interface + mock adapter, `/admin/fabric-registry` screen |
| 3 | Blueprint system (data-driven, seeded), Desired State model helpers, DAG builder (topo sort + cycle detection), React Flow DAG viewer, Deployment Planner (plan generation) | Blueprint picker + live dependency graph in the wizard |
| 4 | Provisioning engine: Postgres-backed job runner, step executor framework, LRO polling, retry/resume, idempotency (desired-vs-actual reconciliation), rollback policy | `/api/deployments/[id]/run`, live deployment status page |
| 5 | Connections: `ConnectionRegistryService`, `FabricConnectionService`, `OAuthConnectionService`, `SecretProvider` (mock vault + Key Vault interface), connector catalog UI | Connection Hub wizard step |
| 6 | Ingestion wizard, medallion-aware desired resources (Bronze/Silver/Gold), initial load step in the provisioning engine | Ingestion configuration step, initial-load step executor |
| 7 | Microsoft Graph client, Entra access options (existing user/guest/internal/group/SP), `CustomerAccess` model + assignment service enforcing least privilege | User Access wizard step |
| 8 | Appointment scheduling (`ServiceAgent`, `Appointment`), calendar service abstraction, server-side deployment gate | Appointment step, hard gate on Create |
| 9 | SQL self-service (`SqlEndpoint` resolution), semantic model + starter report options as blueprint-attachable resources | Self-Service wizard step |
| 10 | Customer monitoring (Collector → Store → Customer Filter → simplified KPIs), Customer Portal (Overview/Data/SQL/Reports/Usage/Appointments/Support tabs, only enabled features shown) | Customer portal |
| 11 | Admin portal (dashboard, customer detail, deployment DAG/steps/retry/rollback), audit log, alerting | Admin portal |
| 12 | Hardening: redaction, rate limiting, tests (unit/integration/e2e), full documentation set | Green test suite, docs |

## Deliberate scope decisions

- **Demo/mock adapters are the primary tested path.** Real Fabric/Graph/Mail/Calendar
  adapters are implemented behind the same interfaces and are wired for production, but
  they require real Entra app registration + Fabric tenant access this environment does
  not have (see "External configuration required" in the final report). Building against
  live Microsoft services was not possible without customer-provided credentials — this
  is the one category of stop condition the brief itself calls out
  ("an external credential is genuinely required"). The application does not fake success
  against those services; it clearly reports demo-mode status.
- **Workflow abstraction, not a workflow engine dependency.** `Deployment`/
  `DeploymentStep`/`LongRunningOperation` model durable, resumable execution state in
  Postgres. The step-executor interface is designed so a future swap to Temporal or
  Trigger.dev only touches the *runner*, never the domain model or the step definitions.
- **Prisma 7 stable**, not the `8.0.0-rc` version that `npm install prisma` currently
  resolves to as "latest" on npm — a release candidate is not appropriate for a
  production-grade base.
