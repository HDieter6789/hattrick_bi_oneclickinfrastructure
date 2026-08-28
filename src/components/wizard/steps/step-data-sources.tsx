"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Cable, FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectorCatalog, ConnectionAuthForm, type ConnectorCatalogItem, type CreateConnectionPayload } from "@/components/connections";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";

interface ApiConnection {
  id: string;
  displayName: string;
  connectorTypeKey: string;
}

/**
 * Public, credential-free Microsoft sample dataset (NYC TLC trip records,
 * widely used in Fabric/Power BI tutorials) — a real Azure Blob Storage
 * account with anonymous read access, not a fabricated data source. Reusing
 * the generic Azure Blob Storage connector with `authMethod: "Anonymous"`
 * (see prisma/seed/connectors.ts) rather than a bespoke "SampleData"
 * connector, so this stays a preset payload for the existing generic
 * Connection Hub flow instead of new per-source UI.
 */
const SAMPLE_DATA_CONNECTION: Omit<CreateConnectionPayload, "customerId"> = {
  connectorTypeKey: "AzureBlobs",
  displayName: "NYC Taxi (public sample data)",
  authMethod: "Anonymous",
  parameters: { account: "azureopendatastorage", domain: "blob.core.windows.net" },
};

export function StepDataSources({ data, update, goNext, goBack }: WizardStepProps) {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorCatalogItem | null>(null);
  const [addingSample, setAddingSample] = useState(false);

  async function createConnection(payload: Omit<CreateConnectionPayload, "customerId">) {
    if (!data.customerId) return;
    const { connection } = await fetchJson<{ connection: ApiConnection }>("/api/connections", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...payload, customerId: data.customerId, infrastructureConfigurationId: data.configurationId ?? undefined }),
    });
    toast.success(`Connection "${connection.displayName}" created.`);
    update({ connections: [...data.connections, connection] });
  }

  async function handleCreateConnection(payload: CreateConnectionPayload) {
    await createConnection(payload);
    setSelectedConnector(null);
  }

  async function handleAddSampleData() {
    setAddingSample(true);
    try {
      await createConnection(SAMPLE_DATA_CONNECTION);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add sample data connection");
    } finally {
      setAddingSample(false);
    }
  }

  function removeConnection(id: string) {
    update({ connections: data.connections.filter((c) => c.id !== id) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Sources</CardTitle>
        <CardDescription>Connect any external systems this platform should ingest data from. Optional — repeat as needed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.connections.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Connections added</p>
            {data.connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Cable className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{c.displayName}</span>
                  <Badge variant="outline">{c.connectorTypeKey}</Badge>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeConnection(c.id)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {!selectedConnector ? (
          <>
            {!data.connections.some((c) => c.displayName === SAMPLE_DATA_CONNECTION.displayName) && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Just testing?</p>
                    <p className="text-xs text-muted-foreground">
                      Add Microsoft&apos;s public NYC Taxi sample dataset — no credentials needed.
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddSampleData} disabled={addingSample}>
                  {addingSample ? "Adding…" : "Use sample data"}
                </Button>
              </div>
            )}
            <ConnectorCatalog onSelect={setSelectedConnector} />
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">{selectedConnector.displayName}</p>
            <ConnectionAuthForm
              connector={selectedConnector}
              customerId={data.customerId ?? ""}
              onSubmit={handleCreateConnection}
              onCancel={() => setSelectedConnector(null)}
            />
          </div>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" onClick={goNext}>
            {data.connections.length > 0 ? "Continue" : "Skip"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
