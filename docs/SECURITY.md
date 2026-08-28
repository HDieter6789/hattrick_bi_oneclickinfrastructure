# Security

## Principles

- **Least privilege by default.** Customers receive Gold-read, optional SQL-read,
  optional report/semantic-model access, and portal access — never workspace admin,
  Bronze/Silver, pipeline, notebook, or connection/secret access. See "Customer access
  boundary" in `docs/ARCHITECTURE.md`.
- **Server-side enforcement, not just UI hiding.** Every privileged server action/route
  handler calls `requireAuth()` / `requireRole(...)` / `requireCustomerAccess(customerId)`
  (`src/lib/authz.ts`, `src/lib/require-customer-access.ts`) — a customer user cannot act
  on another customer's data by guessing an id, and role checks are re-derived from the
  database-backed session on every call, never trusted from client input.
- **The appointment gate cannot be bypassed.** `services/provisioning/preflight.ts`
  re-checks `Appointment.status === "confirmed"` from the database before a deployment is
  allowed to start, called both by the UI action and independently inside the engine
  itself (`runDeployment()` calls `assertDeploymentReadyToStart()` too) — there is no
  direct-API code path that skips it.

## Secrets

- **No secrets in the browser bundle.** Fabric/Graph service-principal credentials,
  SMTP credentials, and the Key Vault URL are read only server-side via
  `src/lib/env.ts` (Zod-validated); nothing in `src/app/**/page.tsx` client components or
  any file marked `"use client"` imports `src/lib/env.ts` or `@/db/prisma`.
- **No plaintext credentials in the database.** `ConnectionSecretReference.secretReference`
  is an opaque pointer into a `SecretProvider` (`src/services/secrets/`) — Azure Key Vault
  in production, an in-memory vault in demo mode. Prisma writes for `Connection` never
  include a raw secret value field.
- **No credentials in URLs.** OAuth callback handling exchanges an authorization code
  server-side; the resulting token is stored via `SecretProvider`, never echoed back to
  the client or included in a redirect URL.
- **No password ever emailed.** The welcome email (`services/mail/templates/welcome-email.ts`)
  includes SQL server/database and states the auth method as "Microsoft Entra ID" —
  authentication is Entra-based, so there is no password to send in the first place.

## Logging and audit

- `src/lib/logger.ts` configures Pino with `redact` paths covering `password`, `token`,
  `accessToken`, `refreshToken`, `clientSecret`, `apiKey`, `secret`, `authorization`
  (case variants, up to two levels of nesting) as a defense-in-depth backstop.
- `src/lib/redact.ts`'s `redactForPersistence()` is the primary control: every
  `DeploymentStep.requestMetadata`/`responseMetadata` and `AuditLog.metadata` write runs
  through it before hitting Postgres — regardless of what the upstream Fabric/Graph
  response actually contained.
- `AuditLog` (append-only) records user, action, customer, deployment, resource,
  status, correlation id, and a redacted metadata blob for every sensitive operation
  (deployment start/cancel, connection create, permission grant, dataset delete,
  configuration change) — never a secret value.

## Input validation

Every write path validates input with Zod (`src/schemas/*.ts`) before it reaches a
service or the database — no server action or route handler trusts a raw request body.
The `z.input`/`z.infer` split (see `schemas/fabric-capability.ts`) keeps
default-value-bearing schemas honest about pre- vs. post-validation shapes.

## Subprocess / dynamic execution

This application does not shell out to OS subprocesses or evaluate dynamic code from user
input anywhere — all "execution" is HTTP calls to documented Fabric/Graph REST APIs
through the typed client abstractions, never a raw shell command built from user-supplied
strings.

## Rate limiting

- Fabric API calls: `RealFabricApiClient` respects Fabric's own `Retry-After`/429 signals
  and distinguishes `RequestBlocked` (retry) from `CapacityLimitExceeded` (surface, don't
  retry) — see `docs/FABRIC_API.md` §2.
- Application-facing rate limiting on sensitive endpoints (auth, connection creation,
  deployment start) is a documented follow-up — not yet implemented in this build; see
  "Known limitations" in the final project report. Recommended approach for a Vercel
  deployment: an edge-compatible token-bucket limiter (e.g. Upstash Redis) applied in
  `src/proxy.ts` for `/api/*` routes.

## Role model

| Role | Scope |
|---|---|
| `platform_admin` | Full administrative access: capability registry, blueprints, all customers, all deployments, service agents, audit log |
| `service_agent` | Appointments, assigned customers' onboarding |
| `operations` | Deployment monitoring/retry, connection health, alerts |
| `customer_admin` | Their own customer's configuration, users, portal |
| `customer_user` | Their own customer's portal only (read-only) |

`INTERNAL_ROLES` (`platform_admin`, `service_agent`, `operations`) are distinguished from
`CUSTOMER_ROLES` in `src/lib/authz.ts`; `src/proxy.ts` does a coarse `/admin` vs. `/portal`
redirect based on this split as a first line of defense, with the real enforcement
happening server-side per action.

## Data residency / demo mode

`DEMO_MODE=true` (the default for local development) routes every external integration
through an in-memory mock adapter — no customer data or credentials ever leave the
process, and no real Fabric/Graph/Azure resources are touched. Production deployments
must set `DEMO_MODE=false` and provide real credentials (see `docs/DEPLOYMENT.md`).
