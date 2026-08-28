# Deployment

## Target architecture

- Frontend + backend: Vercel (Next.js App Router, no custom server required).
- Database: any reachable PostgreSQL 15+ (Supabase Postgres, Azure Database for
  PostgreSQL, Neon, etc. — the app is not tightly coupled to any one provider).
- Secrets: Azure Key Vault (production `SecretProvider` implementation).
- Provisioning execution: today, the Next.js server process itself running
  `runDeployment()` (invoked from a server action / API route as a background task).
  For higher-volume production use, move this behind a queue/worker (the engine's
  interface was designed for this — see `docs/ARCHITECTURE.md`'s note on Temporal/
  Trigger.dev) rather than relying on a single request's process lifetime.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js session/JWT signing secret — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL` | Production | Public base URL of the deployment |
| `DEMO_MODE` | No (default `true`) | Set `false` in production — routes Fabric/Graph/Mail/Calendar to real adapters |
| `FABRIC_LIVE_MODE` | No (default `false`) | Set `true` to route only the Fabric client to the real API while `DEMO_MODE` stays `true` (sign-in/Graph/mail/calendar remain mock) — useful for testing real provisioning without also standing up a real Entra sign-in app registration. Ignored once `DEMO_MODE=false` (Fabric is always real then). |
| `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` | For real sign-in | Entra ID app registration for user sign-in (Microsoft provider) |
| `FABRIC_TENANT_ID` | For real Fabric access | Tenant hosting the Fabric capacity |
| `FABRIC_WORKSPACE_ID` | Optional | Default/reference workspace for local dev |
| `FABRIC_DEFAULT_FOLDER_ID` | Optional | Default folder items are placed into |
| `FABRIC_SERVICE_PRINCIPAL_CLIENT_ID` / `FABRIC_SERVICE_PRINCIPAL_CLIENT_SECRET` | For real Fabric access | App-only credentials the provisioning engine authenticates with |
| `GRAPH_API_BASE_URL` | No (has default) | Override for sovereign clouds |
| `KEY_VAULT_URL` | For real secret storage | Azure Key Vault URL |
| `MAIL_PROVIDER` | No (default `mock`) | `mock` \| `smtp` \| `graph` |
| `MAIL_FROM_ADDRESS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | If `MAIL_PROVIDER=smtp` | Outbound mail |
| `CALENDAR_PROVIDER` | No (default `mock`) | `mock` \| `graph` |
| `CONNECTION_OAUTH_CLIENT_ID` / `CONNECTION_OAUTH_CLIENT_SECRET` | For real OAuth2 connectors | App registration used by the Connections Hub "Connect" flow |
| `CONNECTION_OAUTH_AUTHORIZATION_ENDPOINT` / `CONNECTION_OAUTH_TOKEN_ENDPOINT` | For real OAuth2 connectors | The IdP's authorization/token endpoints |
| `CONNECTION_OAUTH_REDIRECT_URI` | For real OAuth2 connectors | Must exactly match the app registration's registered redirect URI, e.g. `https://<host>/api/connections/oauth/callback` |
| `CONNECTION_OAUTH_SCOPE` | No (default `offline_access`) | Space-delimited scope string requested at authorization |

Full reference with inline comments: `.env.example`. Every variable is validated at
process start by `src/lib/env.ts` (Zod) — a missing/invalid required variable fails fast
with a clear message rather than surfacing as a runtime error deep in a service.

**Never** commit a real `.env` file. `.gitignore` excludes `.env*` except `.env.example`.

## Required Microsoft Entra ID app registration

Two app registrations are typically needed in production:

1. **User sign-in app** (`ENTRA_CLIENT_ID`/`_SECRET`) — delegated `openid`, `profile`,
   `email` scopes for Auth.js sign-in. Redirect URI: `{AUTH_URL}/api/auth/callback/microsoft-entra-id`.
2. **Service principal for provisioning** (`FABRIC_SERVICE_PRINCIPAL_CLIENT_ID`/`_SECRET`) —
   app-only (client-credentials) access to the Fabric REST API and Microsoft Graph. A
   Fabric tenant admin must additionally enable the relevant "service principals can use
   Fabric APIs" tenant setting in the Fabric admin portal — this is a governance toggle
   independent of the Entra app registration and cannot be configured programmatically
   from this application (see `docs/FABRIC_API.md` §7).

Exact Graph permission names required by the provisioning engine (guest invites, group
management, calendar, mail) are documented alongside the services that use them — see the
final project report's "Required Microsoft Entra permissions" section for the
consolidated list once all phases are complete.

## Required Fabric permissions

The service principal needs, at minimum, `Contributor` on the workspaces it manages
(granted after workspace creation, or `Workspace.ReadWrite.All` delegated/app-only scope
to create workspaces in the first place — subject to the tenant admin toggle above). See
`FabricCapability.requiredScopes` in the seeded capability registry
(`prisma/seed/fabric-capabilities.ts`) for the specific scope each provisionable item type
needs.

## Database migrations

```bash
npm run db:migrate   # local development: creates + applies a migration
npm run db:deploy    # production: applies pending migrations without prompting (CI/CD)
```

Run `db:deploy` as part of your deployment pipeline before the new application version
starts receiving traffic. `npm run db:seed` is idempotent (upserts) and safe to re-run,
but only seeds reference data (capability registry, blueprints, connector catalog) — it
never overwrites customer data, and the demo customer/user rows it creates should not be
run against a production database (guard this in your pipeline, e.g. only run `db:seed`
when `DEMO_MODE=true`).

## Vercel-specific notes

- Set all required environment variables in the Vercel project settings (Production and
  Preview environments separately — Preview can safely stay in `DEMO_MODE=true`).
- `next.config.ts` sets `turbopack.root` explicitly to avoid a monorepo-root
  misdetection warning; no other Vercel-specific configuration is required.
- Long-running provisioning jobs invoked via a server action are subject to Vercel's
  function execution time limits — for anything beyond a small number of Fabric
  resources, move `runDeployment()` execution to a dedicated worker/queue rather than
  Vercel's request-response lifecycle (see "Target architecture" above).
