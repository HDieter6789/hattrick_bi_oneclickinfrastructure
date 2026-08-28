# OneClick Fabric Infrastructure

A managed Microsoft Fabric provisioning platform. The provider (you) operates and hosts
the Fabric environment; customers configure their desired data platform, connect their
source systems, and request their environment — without ever receiving administrative
access to the underlying Fabric infrastructure. Customers are consumers of curated Gold
data, not Fabric operators.

This is built as a **Fabric provisioning control plane**:

```
Desired Infrastructure → Validation → Deployment Plan → Dependency Graph
  → Provisioning Workflow → {Fabric REST API, Microsoft Graph, Connection APIs}
  → Actual Infrastructure → Validation → Managed Customer Access
```

See `docs/ARCHITECTURE.md` for the full architecture (with diagrams),
`docs/implementation-plan.md` for how this was built in phases, and the other files under
`docs/` for API integration details, connectors, security, deployment and local
development.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL to a reachable PostgreSQL instance.
# Leave DEMO_MODE=true — every external integration (Fabric, Microsoft Graph, mail,
# calendar) runs against an in-memory mock adapter in demo mode, so the full
# provisioning flow works end to end without any real Microsoft credentials.

npm run db:generate
npm run db:migrate
npm run db:seed

npm run dev
```

Open `http://localhost:3000`, sign in with the demo form (e.g.
`admin@oneclick-fabric.example` for a platform admin), and you're in.

Full instructions, including what each command does and demo-mode role mapping: see
`docs/DEVELOPMENT.md`.

## Technology

- **Frontend:** Next.js (App Router), React, TypeScript (strict), Tailwind CSS,
  shadcn/ui, TanStack Query, React Hook Form + Zod, React Flow (dependency graph
  visualization)
- **Backend:** Next.js server actions/route handlers + a framework-free service layer
  (`src/services/`), Prisma ORM, PostgreSQL
- **Auth:** Microsoft Entra ID via Auth.js, with a demo Credentials provider for local
  development (disabled outside `DEMO_MODE`)
- **External integrations:** Microsoft Fabric REST API, Microsoft Graph, Azure Key
  Vault (secrets), SMTP/Graph (mail) — every one behind an interface with a mock and a
  real implementation, selected by `DEMO_MODE` (see `docs/ARCHITECTURE.md`)

## Non-negotiable architectural rules this codebase follows

- **No per-item-type React components.** Every Fabric resource type (Lakehouse,
  Warehouse, Notebook, Pipeline, ...) is provisioned generically via the **Fabric
  Capability Registry** + **Dynamic Parameter Engine** + one generic form renderer — see
  `docs/FABRIC_API.md`.
- **Desired vs. actual state.** The provisioning engine never talks to raw Fabric
  payloads directly outside `services/fabric/`; it reconciles `DesiredResource` against
  `ActualResource`, which is what makes retries idempotent (brief section 30).
- **The service appointment gate cannot be bypassed.** Enforced server-side, re-derived
  from the database on every deployment-start call — see `docs/ARCHITECTURE.md`'s
  sequence diagram.
- **Customers get Gold-read (+ optional SQL/report/semantic-model access) only** —
  never workspace admin, Bronze/Silver, pipelines, notebooks, or credentials. See
  `docs/SECURITY.md`.

## Status

See the final implementation report (delivered alongside this codebase) for exactly
what's implemented vs. outstanding, test results, and required external configuration
for a production rollout. In short: the full domain model, Fabric API client + capability
registry + dependency graph + provisioning engine (idempotent, retryable, with rollback
policy), and the core service layer for connections/appointments/ingestion/monitoring are
implemented and unit-tested; end-to-end verification against a live database and real
Microsoft services was not possible in the development sandbox (no local PostgreSQL,
Fabric tenant, or Entra app registration available) — `docs/DEVELOPMENT.md` and
`docs/DEPLOYMENT.md` cover exactly what to provide to run this for real.
