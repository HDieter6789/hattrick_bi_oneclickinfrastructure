# Development

## Prerequisites

- Node.js 20+
- A local PostgreSQL instance (or a hosted one — Supabase's Postgres works with no
  code changes; the app is not tightly coupled to Supabase, see `docs/ARCHITECTURE.md`)

## First-time setup

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL to a real reachable Postgres.
# DEMO_MODE=true is fine to leave as-is — Fabric/Graph/Mail/Calendar all run
# against in-memory mock adapters, so you don't need real Microsoft credentials
# to develop against this codebase end to end.
```

Generate the Prisma client (already committed to `.gitignore`, must be generated
locally):

```bash
npm run db:generate
```

Apply the schema to your database and seed it:

```bash
npm run db:migrate   # creates the initial migration + applies it (prompts for a name the first time)
npm run db:seed      # Fabric capability registry, blueprints, connector catalog, demo customer/agent
```

Start the dev server:

```bash
npm run dev
```

Sign in at `http://localhost:3000/sign-in`. In demo mode, use the "Continue in demo mode"
form with one of:

- `admin@oneclick-fabric.example` → `platform_admin`
- `agent@oneclick-fabric.example` → `service_agent`
- `ops@anything` → `operations`
- `customeradmin@anything` → `customer_admin`
- any other email → `customer_user`

(Role inference is prefix-based in demo mode only — see `inferDemoRole()` in `src/auth.ts`.)

## Everyday commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test         # vitest (unit + integration)
npm run test:watch   # vitest watch mode
npm run test:e2e     # Playwright (wizard end-to-end)
npm run db:studio    # Prisma Studio — browse/edit data
```

Always run `typecheck`, `lint`, and `test` before committing — CI (or you, locally)
should treat any of the three failing as a blocker.

## Repository layout

```
src/
  app/                # Next.js App Router routes (route groups: (admin), (portal))
  components/         # Shared, feature-agnostic UI (shadcn/ui primitives + shared widgets)
  features/           # Feature-scoped UI + server actions, one dir per bounded context
  services/           # Business logic + external integrations, framework-free
    fabric/           # FabricApiClient, capability registry, payload builder
    graph/             # MicrosoftGraphClient
    connections/       # Connector registry, Fabric connections, OAuth
    provisioning/       # DAG, planner, engine, steps, rollback, preflight
    secrets/            # SecretProvider (mock / Azure Key Vault)
    mail/                # Mail service + templates
    calendar/            # Calendar service (appointments)
    monitoring/          # Customer usage snapshot / status computation
  lib/                 # Cross-cutting: env, logger, redact, authz
  db/                  # Prisma client singleton
  schemas/             # Zod input validation, one file per domain concept
  types/               # Ambient type augmentation (next-auth.d.ts)
prisma/
  schema/              # Multi-file Prisma schema, one file per bounded context
  seed/                # Seed data modules (capabilities, blueprints, connectors)
  seed.ts              # Seed entrypoint (npm run db:seed)
tests/
  unit/                # Vitest, no I/O
  integration/         # Vitest, may hit a real/test database
  e2e/                 # Playwright
docs/                  # This file and its siblings
```

Business logic never lives directly in a React component or in an API route body —
routes/server actions validate input, call a service, and shape the response; the
service holds the logic.

## Adding a new Fabric item type / connector

See `docs/FABRIC_API.md` ("Adding a new Fabric item type") and `docs/CONNECTORS.md`
("Adding a connector"). In both cases: seed data + registry, no new UI component.

## Working without a database

Most of the domain logic (DAG, naming, payload building, monitoring status computation,
schedule resolution) is pure and unit-tested without any database — `npm run test` runs
these without needing Postgres at all. Anything that touches Prisma requires a real
`DATABASE_URL`.
