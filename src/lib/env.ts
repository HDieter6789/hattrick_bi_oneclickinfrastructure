import { z } from "zod";

/**
 * Single source of truth for environment configuration. Every env var the
 * app reads goes through here — never `process.env.X` scattered around the
 * codebase — so a missing/invalid value fails fast at boot with a clear
 * message instead of surfacing as a cryptic runtime error deep in a
 * service. See docs/DEPLOYMENT.md for the full variable reference.
 */

const boolFromString = z
  .union([z.literal("true"), z.literal("false"), z.literal(""), z.undefined()])
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Demo/development mode (section 57): when true, Fabric/Graph/Mail/Calendar
  // use in-memory mock adapters instead of calling real Microsoft services.
  DEMO_MODE: boolFromString.default(true),

  // Escape hatch for testing real Fabric provisioning while everything else
  // (sign-in, Graph, mail, calendar, secrets) stays in demo mode — e.g. to
  // try the wizard against a real tenant without also standing up a real
  // Entra sign-in app registration. Ignored (Fabric always real) once
  // DEMO_MODE=false. See isFabricLive() below — this is the ONLY place
  // FABRIC_LIVE_MODE is read; every Fabric-touching call site goes through
  // isFabricLive(), never this flag directly.
  FABRIC_LIVE_MODE: boolFromString.default(false),

  // TESTING ONLY (section 21 — the appointment-confirmed deployment gate is
  // otherwise mandatory and unbypassable by design). When true, both
  // server-side enforcement points (features/provisioning/service.ts's
  // createDeployment, services/provisioning/preflight.ts) skip the
  // appointment-confirmed check. Must stay `false` in any real deployment —
  // there is deliberately no way to flip this via the UI, only via the
  // server's own environment configuration.
  SKIP_APPOINTMENT_GATE: boolFromString.default(false),

  DATABASE_URL: z.url(),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_URL: z.url().optional(),

  // Microsoft Entra ID app registration for platform sign-in (section 23).
  // Genuinely required external configuration — see docs/DEPLOYMENT.md.
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_CLIENT_ID: z.string().optional(),
  ENTRA_CLIENT_SECRET: z.string().optional(),

  // Fabric API (section 8, 58). Never hardcoded — read only from env.
  FABRIC_API_BASE_URL: z.url().default("https://api.fabric.microsoft.com/v1"),
  FABRIC_TENANT_ID: z.string().optional(),
  FABRIC_WORKSPACE_ID: z.string().optional(),
  FABRIC_DEFAULT_FOLDER_ID: z.string().optional(),
  // Fabric capacity newly-created workspaces are assigned to at creation
  // time (see services/provisioning/planner.ts) — a workspace with no
  // capacity cannot host any items (Lakehouse/Notebook/etc. creation fails
  // with a 403 "FeatureNotAvailable"). Optional only so the app still boots
  // without it; provisioning a new workspace without it configured will
  // itself fail at the Fabric API, by design (no silent fallback).
  FABRIC_CAPACITY_ID: z.string().optional(),
  // A workspace created purely by the provisioning service principal has
  // no human member at all — internal staff (platform_admin/operations)
  // can't see or manage it in the Fabric portal without being explicitly
  // added. If set, every newly created workspace grants this principal
  // "Admin" (see create-workspace.ts) so staff retain visibility; this is
  // separate from — and unrelated to — the strictly Viewer-only access the
  // access_configuration step grants to CUSTOMER principals.
  FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID: z.string().optional(),
  FABRIC_INTERNAL_ADMIN_PRINCIPAL_TYPE: z.enum(["User", "Group", "ServicePrincipal"]).default("User"),
  FABRIC_SERVICE_PRINCIPAL_CLIENT_ID: z.string().optional(),
  FABRIC_SERVICE_PRINCIPAL_CLIENT_SECRET: z.string().optional(),

  // Microsoft Graph (section 23). Client-credentials app registration —
  // defaults to the Fabric service principal (env.ts factory below) since
  // a single Entra app registration commonly holds both Fabric and Graph
  // API permissions; set these explicitly only when a separate app
  // registration is used for Graph.
  GRAPH_API_BASE_URL: z.url().default("https://graph.microsoft.com/v1.0"),
  GRAPH_TENANT_ID: z.string().optional(),
  GRAPH_SERVICE_PRINCIPAL_CLIENT_ID: z.string().optional(),
  GRAPH_SERVICE_PRINCIPAL_CLIENT_SECRET: z.string().optional(),

  // Secret vault (section 14). Production uses Azure Key Vault.
  KEY_VAULT_URL: z.url().optional(),

  // Mail (section 27).
  MAIL_PROVIDER: z.enum(["mock", "smtp", "graph"]).default("mock"),
  MAIL_FROM_ADDRESS: z.email().default("noreply@oneclick-fabric.example"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // Support contact surfaced in the welcome email — defaults to
  // MAIL_FROM_ADDRESS when unset.
  SUPPORT_EMAIL: z.email().optional(),
  SUPPORT_PHONE: z.string().optional(),

  // Calendar (section 25-26).
  CALENDAR_PROVIDER: z.enum(["mock", "graph"]).default("mock"),

  // Connections Hub — generic OAuth2 "Connect" flow (section 15). Only
  // required for real (non-demo) OAuth-authenticated connectors; the state
  // signature reuses AUTH_SECRET rather than a dedicated variable.
  CONNECTION_OAUTH_CLIENT_ID: z.string().optional(),
  CONNECTION_OAUTH_CLIENT_SECRET: z.string().optional(),
  CONNECTION_OAUTH_AUTHORIZATION_ENDPOINT: z.url().optional(),
  CONNECTION_OAUTH_TOKEN_ENDPOINT: z.url().optional(),
  CONNECTION_OAUTH_REDIRECT_URI: z.url().optional(),
  CONNECTION_OAUTH_SCOPE: z.string().default("offline_access"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isDemoMode(): boolean {
  return getEnv().DEMO_MODE;
}

/** Whether the Fabric client factory (src/services/fabric/index.ts) should
 * call the real Fabric REST API. True whenever the app is fully out of demo
 * mode, OR when DEMO_MODE=true but FABRIC_LIVE_MODE=true was explicitly set
 * to test real provisioning in isolation. */
export function isFabricLive(): boolean {
  const env = getEnv();
  return !env.DEMO_MODE || env.FABRIC_LIVE_MODE;
}

/** TESTING ONLY — see the SKIP_APPOINTMENT_GATE schema comment above. */
export function isAppointmentGateSkipped(): boolean {
  return getEnv().SKIP_APPOINTMENT_GATE;
}
