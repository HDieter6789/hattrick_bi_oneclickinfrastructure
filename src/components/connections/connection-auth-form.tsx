"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AUTH_METHODS_WITHOUT_SECRET,
  AUTH_METHOD_LABELS,
  type ConnectionAuthMethod,
  type ConnectorCatalogItem,
  type CreationMethodParameter,
} from "./types";

/** Extra non-secret fields each auth method needs beyond the connector's
 * own creationMethod parameters (username, client id, ...), plus whether
 * it needs a secret value at all and what to label it. This is the ONE
 * place auth-method-specific field composition lives — there is
 * deliberately no per-connector-type form. */
const AUTH_METHOD_EXTRA_FIELDS: Record<ConnectionAuthMethod, CreationMethodParameter[]> = {
  UsernamePassword: [{ name: "username", dataType: "Text", required: true }],
  Windows: [{ name: "username", dataType: "Text", required: true }],
  WindowsWithoutImpersonation: [{ name: "username", dataType: "Text", required: true }],
  ServicePrincipal: [
    { name: "clientId", dataType: "Text", required: true, description: "Application (client) ID" },
    { name: "tenantId", dataType: "Text", required: true },
  ],
  KeyPair: [{ name: "passphrase", dataType: "Text", required: false, description: "Private key passphrase, if any" }],
  APIKey: [],
  AccountKey: [],
  SAS: [],
  SharedAccessSignature: [],
  Key: [],
  Anonymous: [],
  OAuth2: [],
  OrganizationalAccount: [],
  Gateway: [],
  WorkspaceIdentity: [],
};

const SECRET_FIELD_LABEL: Partial<Record<ConnectionAuthMethod, string>> = {
  UsernamePassword: "Password",
  Windows: "Password",
  WindowsWithoutImpersonation: "Password",
  ServicePrincipal: "Client secret",
  APIKey: "API key",
  Key: "Key",
  AccountKey: "Account key",
  SAS: "SAS token",
  SharedAccessSignature: "SAS token",
  KeyPair: "Private key",
};

export interface CreateConnectionPayload {
  customerId: string;
  connectorTypeKey: string;
  displayName: string;
  authMethod: ConnectionAuthMethod;
  parameters: Record<string, unknown>;
  secretValue?: string;
}

export interface ConnectionAuthFormProps {
  connector: ConnectorCatalogItem;
  customerId: string;
  /** Called with the assembled, client-validated payload on submit. The
   * caller decides how to persist it (typically `POST /api/connections`)
   * — kept out of this component so it stays usable both standalone and
   * as a wizard step that batches submission. */
  onSubmit: (payload: CreateConnectionPayload) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
}

/**
 * Generic auth form for ANY connector: which fields render is driven
 * entirely by `connector.creationMethodsJson`/`supportedCredentialTypesJson`
 * plus the auth-method field map above — the same dynamic-parameter
 * philosophy as the Fabric Capability Registry's form renderer. There is
 * no `SalesforceConnectionForm`/`SqlConnectionForm`/etc.
 */
export function ConnectionAuthForm({ connector, customerId, onSubmit, onCancel, className }: ConnectionAuthFormProps) {
  const authMethods = connector.supportedCredentialTypesJson;
  const creationMethods = connector.creationMethodsJson;

  const [creationMethodIndex, setCreationMethodIndex] = useState(0);
  const [authMethod, setAuthMethod] = useState<ConnectionAuthMethod | undefined>(authMethods[0]);
  const [displayName, setDisplayName] = useState(connector.displayName);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [secretValue, setSecretValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectorParameters = creationMethods[creationMethodIndex]?.parameters ?? [];
  const extraFields = authMethod ? AUTH_METHOD_EXTRA_FIELDS[authMethod] : [];
  const needsSecret = authMethod ? !AUTH_METHODS_WITHOUT_SECRET.has(authMethod) : false;
  const secretLabel = (authMethod && SECRET_FIELD_LABEL[authMethod]) ?? "Secret value";

  const allFields = [...connectorParameters, ...extraFields];

  function setField(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!authMethod) {
      setError("Choose an authentication method.");
      return;
    }
    for (const field of allFields) {
      if (field.required && !values[field.name]) {
        setError(`"${field.name}" is required.`);
        return;
      }
    }
    if (needsSecret && !secretValue) {
      setError(`${secretLabel} is required for ${AUTH_METHOD_LABELS[authMethod]}.`);
      return;
    }

    const parameters: Record<string, unknown> = {};
    for (const field of allFields) {
      const value = values[field.name];
      if (value === undefined || value === "") continue;
      parameters[field.name] = field.dataType === "Number" ? Number(value) : value;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        customerId,
        connectorTypeKey: connector.connectionTypeKey,
        displayName,
        authMethod,
        parameters,
        secretValue: needsSecret ? secretValue : undefined,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="connection-display-name">Connection name</Label>
        <Input id="connection-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>

      {creationMethods.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="connection-creation-method">Connection method</Label>
          <Select
            value={String(creationMethodIndex)}
            onValueChange={(v) => setCreationMethodIndex(Number(v))}
          >
            <SelectTrigger id="connection-creation-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {creationMethods.map((method, i) => (
                <SelectItem key={method.name} value={String(i)}>
                  {method.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="connection-auth-method">Authentication method</Label>
        <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as ConnectionAuthMethod)}>
          <SelectTrigger id="connection-auth-method" className="w-full">
            <SelectValue placeholder="Choose an authentication method" />
          </SelectTrigger>
          <SelectContent>
            {authMethods.map((method) => (
              <SelectItem key={method} value={method}>
                {AUTH_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {connectorParameters.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Connection details</span>
          {connectorParameters.map((field) => (
            <DynamicField key={field.name} field={field} value={values[field.name]} onChange={(v) => setField(field.name, v)} />
          ))}
        </div>
      )}

      {extraFields.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Credentials</span>
          {extraFields.map((field) => (
            <DynamicField key={field.name} field={field} value={values[field.name]} onChange={(v) => setField(field.name, v)} />
          ))}
          {needsSecret && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="connection-secret-value">{secretLabel}</Label>
              <Input
                id="connection-secret-value"
                type="password"
                autoComplete="new-password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                required
              />
            </div>
          )}
        </div>
      )}

      {needsSecret && extraFields.length === 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="connection-secret-value-standalone">{secretLabel}</Label>
          <Input
            id="connection-secret-value-standalone"
            type="password"
            autoComplete="new-password"
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            required
          />
        </div>
      )}

      {authMethod && (authMethod === "OAuth2" || authMethod === "OrganizationalAccount") && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          This connection finishes via a &quot;Connect&quot; step after it&apos;s created — you&apos;ll be redirected to sign in.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Create connection
        </Button>
      </div>
    </form>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CreationMethodParameter;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const id = `connection-field-${field.name}`;
  const label = field.description ?? field.name;

  if (field.dataType === "Boolean") {
    return (
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {field.required && <span className="text-destructive">*</span>}
        </Label>
        <Switch id={id} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={field.dataType === "Number" ? "number" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    </div>
  );
}
