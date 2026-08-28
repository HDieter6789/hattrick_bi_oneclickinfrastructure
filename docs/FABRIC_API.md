# Microsoft Fabric API Integration

This document explains how OneClick Fabric Infrastructure talks to Microsoft Fabric, and
how to extend it as Microsoft ships new Fabric REST APIs.

All findings below were verified against live `learn.microsoft.com` documentation
(fetched 2026-08-27) — not reconstructed from training-data memory, since Fabric's API
surface changes frequently. Source URLs are cited per section.

## 1. `FabricApiClient`

`src/services/fabric/fabric-api-client.ts` defines the **only** interface the rest of the
application is allowed to use to talk to Fabric:

```ts
interface FabricApiClient {
  get<T>(path, options?): Promise<T>;
  getAllPages<T>(path, options?): Promise<T[]>;
  post<T>(path, body?, options?): Promise<FabricLroResult<T>>;
  put/patch<T>(...): Promise<FabricLroResult<T>>;
  delete(path, options?): Promise<void>;
  getPage<T>(path, continuationToken?, options?): Promise<FabricPage<T>>;
}
```

No component, server action, or provisioning step issues a raw `fetch` against
`api.fabric.microsoft.com`. Two implementations exist:

- `RealFabricApiClient` (`real-fabric-api-client.ts`) — production. Bearer-token
  authenticated via a service-principal `AccessTokenProvider`
  (`token-provider.ts`, client-credentials flow against Entra ID), with correlation ids,
  retry/backoff, and full LRO polling (below).
- `MockFabricApiClient` (`mock-fabric-api-client.ts`) — an in-memory item store used when
  `DEMO_MODE=true`. Behaves like a real create → read → idempotency-check cycle so the
  provisioning engine's logic is meaningfully exercisable without a real tenant.

`services/fabric/index.ts` exports `getFabricApiClient()`, the single factory that picks
between them based on `isDemoMode()` (`src/lib/env.ts`). This is the only place `DEMO_MODE`
is checked for Fabric access.

## 2. Long Running Operations

Source: [Long Running Operations](https://learn.microsoft.com/en-us/rest/api/fabric/articles/long-running-operation),
[Get Operation State](https://learn.microsoft.com/en-us/rest/api/fabric/core/long-running-operations/get-operation-state),
[Throttling](https://learn.microsoft.com/en-us/rest/api/fabric/articles/throttling)

A 201/200 response is synchronous. A 202 Accepted response carries `Location`,
`x-ms-operation-id` and `Retry-After` headers. `RealFabricApiClient.pollLongRunningOperation`
polls `GET {Location}` until `LongRunningOperationStatus` is `Succeeded`, `Failed`, or
`Cancelled`, then fetches `GET {Location}/result` on success. Polling honors
`Retry-After` when present, otherwise a 2s default interval, bounded to 120 polls.

Persisted per operation (`LongRunningOperation` Prisma model): `operationId`, `status`,
`retryAfterSeconds`, `resourceId`, `requestId`, plus `resultJson`/`errorJson` — so a
deployment can be resumed against an in-flight Fabric operation instead of losing track
of it across a process restart.

Rate limiting: Fabric enforces **Unified Quota**, per-identity, three independent
60-second-window buckets (Platform/Job Scheduler/LRO APIs, 200 calls/min each). A 429
carries an `errorCode` of either `RequestBlocked` (caller-scoped — retry with backoff) or
`CapacityLimitExceeded` (the tenant's capacity itself is overloaded — retrying
immediately will not help). `FabricApiException.isCapacityLimit` distinguishes these;
`RealFabricApiClient` does **not** blindly retry a `CapacityLimitExceeded` response — it
throws immediately so the provisioning step fails with an actionable message rather than
busy-looping.

## 3. Capability Registry

`FabricCapability` (Prisma model) + `FabricCapabilityRegistryService`
(`src/services/fabric/capability-registry.ts`) is the single source of truth for "what can
OneClick provision". Seeded from `prisma/seed/fabric-capabilities.ts`, grounded in the
Items API reference:
[Create Item](https://learn.microsoft.com/en-us/rest/api/fabric/core/items/create-item),
[Item Management Overview](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/item-management-overview).

Key facts that shaped the design:

- The generic `POST /v1/workspaces/{id}/items` documents roughly 50 `ItemType` values
  today, and Microsoft explicitly frames this list as growing — hence a database-driven
  registry rather than a hardcoded enum anywhere in the app.
- Per-type support genuinely varies. **Dashboard, Datamart, MirroredWarehouse and
  SQLEndpoint have no create API today (list-only)** — seeded with `createSupported:
  false`. The UI must show these as "API provisioning not currently supported"
  (`FabricCapabilityRegistryService.isProvisionable()`), never fake support.
- `creationPayload` vs `definition` (base64-encoded parts) usage varies per item type —
  each seeded capability's `creationPayloadSupported`/`definitionSupported` flags record
  which apply, informing the Dynamic Parameter Engine (below).

### Adding a new Fabric item type

1. Add a row to `prisma/seed/fabric-capabilities.ts` (or call
   `fabricCapabilityRegistry.registerCapability()` from an admin UI/script) with the
   `itemType` exactly matching Fabric's `ItemType` enum value, its `apiPath` (the segment
   under `/v1/workspaces/{id}/...`), and accurate `createSupported`/`updateSupported`/
   `deleteSupported`/`definitionSupported`/`creationPayloadSupported` flags — verify these
   against the item type's own Create/Update/Delete/Get Definition reference pages, not
   just the summary table (see the "Flags — could not fully verify" caveat below).
2. Add `FabricParameterSchema` rows (in the same seed entry's `parameters[]`) for the
   fields a user should be able to configure — `targetPath` uses dot-notation into the
   generated request body (e.g. `"creationPayload.enableSchemas"`); see
   `src/services/fabric/payload-builder.ts`.
3. That's it. No new React component, no new step executor — the generic
   `createFabricItemStep` (`src/services/provisioning/steps/create-fabric-item.ts`) and
   the generic `DynamicFabricForm` render/provision every capability the registry knows
   about. A dedicated step executor is only needed if the new capability's API shape is
   genuinely different from "POST an item into a workspace" (the way workspace creation
   itself is — see `steps/create-workspace.ts` for that exception, and
   `step-registry.ts`'s `resourceStepOverrides` map for how to register one).

**Known documentation ambiguity:** the Item Management Overview page has an apparent
internal inconsistency about Dataflow support (one note suggests it's unsupported, a
table row lower on the same page shows full CRUD) — likely Dataflow Gen1 (Power BI,
legacy) vs Fabric Dataflow Gen2 being conflated. Re-verify against the live page before
trusting the seeded `Dataflow` capability in a production rollout.

## 4. Dynamic Parameter Engine

`FabricParameterSchema` rows (one per capability, `mode: basic|advanced|raw`) drive a
single generic form renderer (`DynamicFabricForm`/`DynamicFieldRenderer` — see the UI
docs) — never a per-item-type form component. `buildFabricPayload()`
(`services/fabric/payload-builder.ts`) turns resolved field values into the actual Fabric
request body using each field's `targetPath`. `mergeConfigurationModes()` lets a RAW JSON
definition override specific keys on top of the BASIC/ADVANCED values, backing the three
configuration modes from the product brief.

## 5. SQL Analytics Endpoint

Source: [Get Lakehouse](https://learn.microsoft.com/en-us/rest/api/fabric/lakehouse/items/get-lakehouse)

`GET /v1/workspaces/{workspaceId}/lakehouses/{lakehouseId}` returns
`properties.sqlEndpointProperties = { connectionString, id, provisioningStatus }`.
`provisioningStatus` (`InProgress|Success|Failed`) provisions asynchronously *after* the
Lakehouse item itself already exists — the `resolve_sql_endpoint` provisioning step polls
this rather than assuming it's ready the instant the Lakehouse is created.

## 6. Admin/monitoring APIs and the capacity-metrics constraint

Source: [List Items (Admin)](https://learn.microsoft.com/en-us/rest/api/fabric/admin/items/list-items),
[Get Capacity](https://learn.microsoft.com/en-us/rest/api/fabric/core/capacities/get-capacity),
[Capacity Metrics App overview](https://learn.microsoft.com/en-us/fabric/enterprise/metrics-app)

There is **no supported, cross-customer-safe REST API for granular per-workspace
capacity consumption**. `GET /v1/capacities/{id}` returns only static metadata (sku,
region, state) — no usage numbers. The Azure ARM capacities-usages endpoint returns only
a single aggregate CU number for the whole capacity. The only granular, item-level
consumption data lives inside the Fabric Capacity Metrics semantic model, which Microsoft
explicitly documents as **unsupported for external querying**.

**Design consequence:** the Customer Usage Report (`services/monitoring/`) is built
exclusively from data this platform already owns and isolates per customer — its own
`DeploymentStep`/`ActualResource`/`IngestionConfiguration` rows, already filtered by
`customerId` — never from a shared capacity's metrics. If a future requirement needs true
per-workspace CU billing, the safe options are (a) one dedicated capacity per customer, or
(b) an explicit, opt-in integration with the (unsupported) Metrics semantic model with a
documented risk acceptance — this is not implemented.

## 7. Authentication

Bearer tokens from Microsoft Entra ID against resource `https://api.fabric.microsoft.com`.
The provisioning engine runs as background jobs, not in a signed-in user's session, so it
authenticates app-only via client-credentials (`FABRIC_SERVICE_PRINCIPAL_CLIENT_ID`/
`_SECRET` against `FABRIC_TENANT_ID`). Not every Fabric API supports service-principal
auth uniformly — check each item type's own "supported identities" table before assuming
a new capability works app-only (e.g. MLModel/MLExperiment reject service principals
entirely per current docs). Service principals additionally require a Fabric tenant admin
to enable the relevant "Developer settings" toggle before they can create
workspaces/connections/pipelines at all — a governance gate independent of the Entra app
registration itself.

Scopes are split generic (`Item.ReadWrite.All`) vs. specific
(`Lakehouse.ReadWrite.All`, ...) — `FabricCapability.requiredScopes` records the specific
scope(s) each seeded capability needs; scopes apply to delegated (user) access only, not
to service-principal access, which is instead governed by the tenant admin toggle above.
