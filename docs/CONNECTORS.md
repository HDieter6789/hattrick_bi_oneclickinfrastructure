# Connectors

The Connection Hub does not hand-maintain hundreds of connector definitions in the
frontend. Wherever possible it retrieves Fabric-supported connection types
programmatically from `GET /v1/connections/supportedConnectionTypes` — this endpoint
returns, per connector, its `creationMethods[]` (each with typed, named parameters),
`supportedCredentialTypes[]`, and gateway requirements. See `docs/FABRIC_API.md` §3 for
the client-side plumbing (`FabricApiClient`).

## Architecture

```
ConnectorRegistryService.syncConnectorCatalog()
        ↓ (GET /v1/connections/supportedConnectionTypes)
ConnectorMetadata (Prisma model)
        ↓
Connector catalog UI (searchable, category-grouped cards)
        ↓ (user picks a connector + auth method)
Generic ConnectionAuthForm (renders fields from creationMethodsJson/supportedCredentialTypesJson)
        ↓ (POST /api/connections — non-secret parameters + a secret reference)
Connection (Prisma model, status "draft")
        ↓
FabricConnectionService.createFabricConnection(connectionId)
        ↓ (POST /v1/connections, credential resolved via SecretProvider)
Connection (status "connected") + ConnectionSecretReference
```

As with Fabric item types, there is **no per-connector-type React component**
(`SalesforceConnectionForm.tsx` does not exist). The two real, generic components are
`ConnectorCatalog` and `ConnectionAuthForm` (`src/components/connections/`, exported from
its `index.ts`) — a searchable/category-grouped picker and an auth-method-driven form,
respectively, both consumed as-is by the provisioning wizard's "Data Sources" step. The
auth-method-specific fields render generically off each connector's stored metadata
(`toParameterList`/`buildCredentialDetails` in `fabric-connection-service.ts`), the same
"dynamic parameter" approach used throughout the Fabric provisioning UI.

## Supported authentication models

Matches Fabric's documented `CredentialType` enum: `OAuth2`, `UsernamePassword`
(`Basic`), `ServicePrincipal`, `APIKey` (`Key`), `AccountKey`, `SAS`
(`SharedAccessSignature`), `Anonymous`, `OrganizationalAccount` (`Windows`/
`WindowsWithoutImpersonation`), `Gateway` (on-premises data gateway routing),
`WorkspaceIdentity`, `KeyPair`. The `ConnectionAuthMethod` Prisma enum covers this full
set; a given connector only offers the subset it actually documents support for.

## Credential storage

No connector auth flow ever writes a plaintext credential to Postgres. Every credential
value goes through `SecretProvider.storeSecret()` (`src/services/secrets/`); only the
returned opaque `secretReference` is persisted, on `ConnectionSecretReference`. See
`docs/SECURITY.md`.

## OAuth2 connectors ("Connect" flow)

For OAuth2-capable connectors (brief section 15): the customer clicks **Connect**, is
redirected to the provider's consent screen, completes auth, and returns to the app
showing **CONNECTED** — never a token value. `OAuthConnectionService`
(`src/services/connections/`) owns authorization-URL generation and the callback
exchange; `Connection.connectedAt`/`expiresAt`/`lastValidationAt`/`health` track state
without ever exposing the token itself.

## Connector catalog (seed data)

Since this development sandbox has no live Fabric tenant to sync against, a realistic
seed catalog (`prisma/seed/connectors.ts`) stands in for a real sync, covering every
category the product brief lists: Microsoft, Databases, Cloud Storage, SaaS, Files, Web,
Analytics, ERP, CRM. Run `ConnectorRegistryService.syncConnectorCatalog()` against a real
Fabric tenant to replace/refresh this with live data — it upserts by
`connectionTypeKey`, so re-running it is always safe.

## API routes

- `GET /api/connections/connectors` — the catalog `ConnectorCatalog` renders from.
- `GET /api/connections?customerId=` — a customer's connections (status/health only).
- `POST /api/connections` — creates a `Connection` (`status: "draft"`), stores a secret
  reference if `secretValue` is present, and immediately calls
  `fabricConnectionService.createFabricConnection()` unless the auth method requires the
  interactive OAuth2 flow first (`OAuth2`, `OrganizationalAccount`) — see
  `src/app/api/connections/route.ts`. A Fabric-side failure still returns 201 with the
  `Connection` row (now `status: "error"`) plus a `warning` string, rather than a bare 500,
  so the caller can inspect/retry instead of losing the record.
- `GET /api/connections/[connectionId]` , `DELETE` — read/remove one connection.
- `GET /api/connections/[connectionId]/oauth/authorize` , `GET /api/connections/oauth/callback`
  — the OAuth2 "Connect" flow's authorization-URL and token-exchange endpoints.

## Adding a connector

In the common case, you don't — `syncConnectorCatalog()` picks up anything Microsoft adds
to `supportedConnectionTypes` automatically on the next sync. Manual additions (e.g. to
extend the demo seed catalog, or to hand-register a connector Fabric's discovery endpoint
doesn't yet surface) go in `prisma/seed/connectors.ts`, following the existing entries'
shape — `connectionTypeKey`, `displayName`, `category`, `creationMethodsJson`,
`supportedCredentialTypesJson`, `gatewayRequired`.
