# Architecture

OneClick Fabric Infrastructure is a **Fabric provisioning control plane**, not a CRUD
app. Customers configure a desired data platform; the platform reconciles that desire
against real Microsoft Fabric infrastructure it owns and operates, and exposes customers
only a curated, read-only slice of the result.

```mermaid
flowchart LR
    A[Desired Infrastructure] --> B[Validation]
    B --> C[Deployment Plan]
    C --> D[Dependency Graph]
    D --> E[Provisioning Workflow]
    E --> F["Fabric REST API / Microsoft Graph / Connection APIs"]
    F --> G[Actual Infrastructure]
    G --> H[Validation]
    H --> I[Managed Customer Access]
```

## Bounded contexts

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Next.js App Router)"]
        Wizard[Provisioning Wizard]
        Portal[Customer Portal]
        Admin[Admin Portal]
    end

    subgraph Services["Service layer (src/services)"]
        FabricSvc[Fabric API Client + Capability Registry]
        Prov[Provisioning Engine]
        Conn[Connections + Secrets]
        Graph[Microsoft Graph Client]
        Cal[Calendar Service]
        Mail[Mail Service]
        Mon[Monitoring Collector]
    end

    subgraph External["External systems"]
        FabricAPI[Microsoft Fabric REST API]
        GraphAPI[Microsoft Graph]
        Vault[Azure Key Vault]
        SMTP[SMTP / Graph Mail]
    end

    DB[(PostgreSQL via Prisma)]

    Wizard --> Prov
    Wizard --> Conn
    Portal --> Mon
    Admin --> Prov
    Admin --> FabricSvc

    Prov --> FabricSvc
    Prov --> DB
    Conn --> Vault
    Conn --> FabricAPI
    Graph --> GraphAPI
    Cal --> GraphAPI
    Mail --> SMTP
    FabricSvc --> FabricAPI
    Mon --> DB

    Services --> DB
```

## Provisioning pipeline (mandatory abstractions)

Every piece below is required architecture, not incidental structure — see the product
brief's explicit "this abstraction is mandatory" callouts.

```mermaid
flowchart TB
    Registry[Fabric Capability Registry] --> ParamEngine[Dynamic Parameter Engine]
    ParamEngine --> Form[Generic Form Renderer]
    Form --> ConfigModel[Configuration Model]
    ConfigModel --> Planner[Deployment Planner]
    Planner --> DAG[Dependency Graph / DAG]
    DAG --> Engine[Provisioning Engine]
    Engine --> FabricAPI[Fabric REST API]
```

- **Fabric Capability Registry** (`FabricCapability`/`FabricParameterSchema`,
  `services/fabric/capability-registry.ts`) — no Fabric item type is hardcoded into a
  React component; see `docs/FABRIC_API.md` for how to add a new one.
- **Dynamic Parameter Engine** — one generic form renderer driven by parameter schema
  rows, not `LakehouseForm.tsx`/`PipelineForm.tsx`/etc.
- **Desired State Resource Model** (`DesiredResource`/`ActualResource`,
  `services/provisioning/*`) — the provisioning engine reconciles desired vs. actual
  state; this is what makes idempotency (section 30) and retry (section 29) possible.
  `ActualResource` existing for a `DesiredResource` means "skip create", checked before
  every Fabric call in `steps/create-fabric-item.ts` / `create-workspace.ts`.
- **DAG** (`services/provisioning/dag.ts`) — Kahn's-algorithm topological sort +
  explicit cycle detection (`CircularDependencyError`) before any plan is shown or
  executed; unit-tested in `tests/unit/dag.test.ts`.
- **Provisioning Engine** (`services/provisioning/engine.ts`) — a durable job
  abstraction backed by Postgres today (`Deployment`/`DeploymentStep` rows are the
  durable state). Deliberately designed so a future swap to Temporal/Trigger.dev only
  touches *what calls* `runDeployment()`, never the step definitions or domain model.

## Deployment state machine

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> pending: preflight passes
    pending --> running: engine starts
    running --> succeeded: all steps succeeded
    running --> partially_failed: a step failed
    partially_failed --> running: retry/resume
    running --> cancelled: admin cancels
    partially_failed --> rolled_back: rollback executed
    succeeded --> [*]
    rolled_back --> [*]
    cancelled --> [*]
```

`DesiredResource.status` moves through `pending → validating → ready → running →
succeeded|failed|skipped`, and `rollback_pending → rolled_back` when a rollback runs
(`services/provisioning/rollback.ts`). A dependency that fails blocks its dependents
(marked `skipped`, never silently executed out of order) — see `engine.ts`'s
`blockedLogicalNames` tracking.

## The mandatory appointment gate

```mermaid
sequenceDiagram
    participant U as User (wizard)
    participant S as Server Action
    participant P as Preflight
    participant E as Provisioning Engine

    U->>S: Create Infrastructure
    S->>P: assertDeploymentReadyToStart(deploymentId)
    P->>P: re-fetch Appointment from DB
    alt appointment.status !== "confirmed"
        P-->>S: throw
        S-->>U: blocked, cannot start
    else confirmed
        P-->>S: ok
        S->>E: runDeployment(deploymentId)
    end
```

The check (`services/provisioning/preflight.ts`) is re-derived from the database on
every call — never trusted from client input — and is invoked both by the UI's "Create"
action and independently inside `runDeployment()` itself, so there is no code path that
starts provisioning without it.

## Customer access boundary

```mermaid
flowchart LR
    subgraph Provider-owned["Provider-owned (never customer-accessible)"]
        WS[Workspace Admin]
        Bronze[Bronze Lakehouse]
        Silver[Silver Lakehouse]
        Pipe[Pipelines]
        NB[Notebooks]
        Cred[Connections / Secrets]
    end
    subgraph Customer-accessible["Customer can receive"]
        Gold[Gold Lakehouse - read]
        SQL[SQL Analytics Endpoint - read only]
        Report[Power BI Report - view]
        SM[Semantic Model - build, optional]
        PortalAccess[Customer Portal]
    end
    Bronze --> Silver --> Gold
    Gold --> SQL
    Gold --> SM --> Report
```

Enforced in code, not just documentation: `CustomerAccess.fabricRole` is only ever
`"Viewer"` for customer-facing grants (see the regression test in
`tests/unit/customer-access.test.ts`), and the customer portal only ever queries
Gold-scoped/SQL-endpoint/report data — it has no code path that reads Bronze/Silver or
pipeline/notebook internals.

## Multi-file Prisma schema

The schema lives under `prisma/schema/*.prisma` (Prisma's multi-file schema feature),
grouped by bounded context: `auth`, `customer`, `service` (agents/appointments),
`fabric_registry`, `blueprint`, `configuration` (desired/actual state),
`connection`, `ingestion`, `provisioning`, `access`, `data` (SQL/monitoring/catalog),
`notification`, `audit`. See `docs/DEVELOPMENT.md` for the local setup and
`docs/DEPLOYMENT.md` for migrations.

## Known limitations

**Dev/test/prod environment fan-out.** `InfrastructureConfiguration.environmentMode`
supports `single` and `dev_test_prod`, and the Prisma model is ready for it, but
`services/provisioning/planner.ts` currently plans a single `"PROD"` environment
regardless of the selected mode. Extending the planner to generate three parallel
resource sets (one per environment, still sharing one `Blueprint`) is a contained
follow-up — the DAG/engine/idempotency machinery already supports it without changes,
since it operates per-`Deployment`.

**User Access step has no persistence path.** The wizard's "User Access" step (step 8)
collects email addresses in the browser but no API route yet turns them into
`CustomerUser` rows — a `POST /api/customers/[id]/users` (or similar) endpoint plus a
`CustomerUser`-creation call is a contained follow-up. Until then, the
`access_configuration` provisioning step grants `portal_access`/`sql_read` only to
`CustomerUser` rows that already exist (e.g. seeded, or created by an admin directly).

**Some dynamic-parameter picker types have no backing list endpoint.** Of the seven
`resourcePicker`/`workspacePicker`/`folderPicker`/`connectionPicker`/`userPicker` input
types, only `connectionPicker` (backed by `GET /api/connections?customerId=`) renders as
a real searchable combobox in the wizard's Fabric Resources step; the other four fall
back to a plain "enter id" text field. Each needs a small listing route once there's a
real source to list from (Fabric workspaces/folders, platform users).

**No dedicated "Reports" read API.** The customer portal's Reports tab reuses
`GET /api/portal/[customerId]/datasets` (filtered to `availableViaReport`) instead of a
purpose-built endpoint, since no `Report`-specific customer-facing model/route exists yet
beyond the `starterReportEnabled` flag and `DatasetCatalogEntry.availableViaReport`.

**No rate limiting on sensitive endpoints.** Documented in `docs/SECURITY.md` — auth
(`requireAuth`/`requireRole`/`requireCustomerAccess`) and Zod validation are enforced
everywhere, but no per-IP/per-user request-rate throttling exists yet on mutating routes
(deployment creation, connection creation, appointment booking). Recommended before
production traffic: a Vercel Edge Config/KV-backed limiter or an API gateway in front of
Next.js.

**No live PostgreSQL in the development sandbox this project was built in.** `prisma
validate`/`prisma generate` were run repeatedly and pass; `prisma migrate dev` was never
run because no live database/shadow database was available, so **no migration files
exist under `prisma/migrations/` yet**. The first `prisma migrate dev --name init`
against a real database will generate them from the current, validated schema. See
`docs/DEVELOPMENT.md`.

**E2E coverage is minimal.** Only `tests/e2e/auth-gate.spec.ts` (unauthenticated-redirect
checks, no database required) has actually been run. A fuller Playwright suite covering
the wizard → deployment → portal flow needs a seeded database and was out of reach in
this sandbox; unit/integration coverage (211 Vitest tests) is comprehensive for business
logic, but no browser-driven end-to-end run has exercised the full UI.
