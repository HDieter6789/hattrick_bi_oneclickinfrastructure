import { z } from "zod";

/**
 * Input validation for the Connections Hub. Follows the same z.input/z.infer
 * split as schemas/fabric-capability.ts: the `*Input` schema is what gets
 * `.parse()`d (defaulted fields become required in its output type), while
 * `z.input<>` is the pre-default "draft" shape callers construct.
 */

export const connectionAuthMethodSchema = z.enum([
  "OAuth2",
  "UsernamePassword",
  "ServicePrincipal",
  "APIKey",
  "AccountKey",
  "SAS",
  "Anonymous",
  "OrganizationalAccount",
  "Gateway",
  "Key",
  "Windows",
  "WindowsWithoutImpersonation",
  "SharedAccessSignature",
  "WorkspaceIdentity",
  "KeyPair",
]);
export type ConnectionAuthMethodValue = z.infer<typeof connectionAuthMethodSchema>;

export const connectorCategorySchema = z.enum([
  "microsoft",
  "databases",
  "cloud_storage",
  "saas",
  "files",
  "web",
  "analytics",
  "erp",
  "crm",
  "other",
]);

/** Auth methods that never require a secret value at creation time — the
 * credential is either absent (Anonymous), resolved by Fabric itself at
 * runtime (WorkspaceIdentity), tied to an on-prem gateway's own stored
 * credential (Gateway), or supplied later via the OAuth2 "Connect" flow
 * (OAuth2 / OrganizationalAccount — see OAuthConnectionService). */
const AUTH_METHODS_WITHOUT_UPFRONT_SECRET = new Set<ConnectionAuthMethodValue>([
  "Anonymous",
  "WorkspaceIdentity",
  "Gateway",
  "OAuth2",
  "OrganizationalAccount",
]);

export const createConnectionInput = z
  .object({
    customerId: z.string().min(1),
    connectorTypeKey: z.string().min(1),
    displayName: z.string().min(1).max(200),
    authMethod: connectionAuthMethodSchema,
    infrastructureConfigurationId: z.string().min(1).optional(),
    /** Non-secret connection parameters only (server, database, username,
     * client id, tenant id, gateway id, ...) — never a password/key/token.
     * Persisted verbatim to `Connection.parametersJson`. */
    parameters: z.record(z.string(), z.unknown()).default({}),
    /** The single sensitive credential value (password, API key, account
     * key, SAS token, service principal secret, private key, ...), if this
     * auth method needs one. Never persisted directly — routed through
     * SecretProvider.storeSecret() and only its opaque reference is saved. */
    secretValue: z.string().min(1).max(16_384).optional(),
  })
  .superRefine((value, ctx) => {
    if (!AUTH_METHODS_WITHOUT_UPFRONT_SECRET.has(value.authMethod) && !value.secretValue) {
      ctx.addIssue({
        code: "custom",
        path: ["secretValue"],
        message: `authMethod "${value.authMethod}" requires a secret value`,
      });
    }
  });

export type CreateConnectionInput = z.infer<typeof createConnectionInput>;
export type CreateConnectionDraft = z.input<typeof createConnectionInput>;

export const listConnectorsQuery = z.object({
  category: connectorCategorySchema.optional(),
});
export type ListConnectorsQuery = z.infer<typeof listConnectorsQuery>;

export const oauthCallbackInput = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});
export type OAuthCallbackInput = z.infer<typeof oauthCallbackInput>;
