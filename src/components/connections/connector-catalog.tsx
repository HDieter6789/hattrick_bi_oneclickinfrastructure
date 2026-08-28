"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Cloud, Globe, FolderOpen, BarChart3, Building2, Users, Boxes, Layers, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type ConnectorCatalogItem, type ConnectorCategory } from "./types";

const CATEGORY_ICONS: Record<ConnectorCategory, React.ComponentType<{ className?: string }>> = {
  microsoft: Layers,
  databases: Database,
  cloud_storage: Cloud,
  saas: Boxes,
  files: FolderOpen,
  web: Globe,
  analytics: BarChart3,
  erp: Building2,
  crm: Users,
  other: Boxes,
};

async function fetchConnectors(category?: ConnectorCategory): Promise<ConnectorCatalogItem[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const response = await fetch(`/api/connections/connectors${query}`);
  if (!response.ok) {
    throw new Error(`Failed to load connectors (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { connectors: ConnectorCatalogItem[] };
  return body.connectors;
}

export interface ConnectorCatalogProps {
  /** Called when the user picks a connector card. */
  onSelect?: (connector: ConnectorCatalogItem) => void;
  /** Highlights the currently selected connector, if any. */
  selectedConnectionTypeKey?: string;
  className?: string;
}

/**
 * Searchable, category-grouped grid of Fabric connectors, backed by
 * `GET /api/connections/connectors`. Self-contained — fetches its own
 * data — so it can be dropped into the provisioning wizard's Data Sources
 * step (or anywhere else) with just an `onSelect` handler.
 */
export function ConnectorCatalog({ onSelect, selectedConnectionTypeKey, className }: ConnectorCatalogProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | "all">("all");

  const { data: connectors, isLoading, isError } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => fetchConnectors(),
  });

  const categories = useMemo(() => {
    const present = new Set((connectors ?? []).map((c) => c.category));
    return (Object.keys(CATEGORY_LABELS) as ConnectorCategory[]).filter((c) => present.has(c));
  }, [connectors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (connectors ?? []).filter((c) => {
      if (activeCategory !== "all" && c.category !== activeCategory) return false;
      if (q && !c.displayName.toLowerCase().includes(q) && !c.connectionTypeKey.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [connectors, search, activeCategory]);

  const grouped = useMemo(() => {
    const groups = new Map<ConnectorCategory, ConnectorCatalogItem[]>();
    for (const connector of filtered) {
      const list = groups.get(connector.category) ?? [];
      list.push(connector);
      groups.set(connector.category, list);
    }
    return groups;
  }, [filtered]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search connectors…"
            className="pl-7"
            aria-label="Search connectors"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={activeCategory === "all" ? "secondary" : "ghost"}
            onClick={() => setActiveCategory("all")}
          >
            All
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              type="button"
              size="sm"
              variant={activeCategory === category ? "secondary" : "ghost"}
              onClick={() => setActiveCategory(category)}
            >
              {CATEGORY_LABELS[category]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the connector catalog. Try again shortly.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No connectors match &quot;{search}&quot;.
          </CardContent>
        </Card>
      )}

      {!isLoading &&
        !isError &&
        Array.from(grouped.entries()).map(([category, items]) => (
          <section key={category} className="flex flex-col gap-2.5">
            {activeCategory === "all" && (
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{CATEGORY_LABELS[category]}</h3>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((connector) => {
                const Icon = CATEGORY_ICONS[connector.category];
                const isSelected = connector.connectionTypeKey === selectedConnectionTypeKey;
                return (
                  <Card
                    key={connector.connectionTypeKey}
                    role={onSelect ? "button" : undefined}
                    tabIndex={onSelect ? 0 : undefined}
                    onClick={() => onSelect?.(connector)}
                    onKeyDown={(e) => {
                      if (onSelect && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSelect(connector);
                      }
                    }}
                    className={cn(
                      "transition-colors",
                      onSelect && "cursor-pointer hover:ring-primary/40",
                      isSelected && "ring-2 ring-primary",
                    )}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-4" />
                          </span>
                          <CardTitle>{connector.displayName}</CardTitle>
                        </div>
                        {connector.gatewayRequired && (
                          <Badge variant="outline" className="shrink-0">
                            Gateway
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="flex flex-wrap gap-1 pt-1">
                        {connector.supportedCredentialTypesJson.slice(0, 3).map((method) => (
                          <Badge key={method} variant="secondary">
                            {method}
                          </Badge>
                        ))}
                        {connector.supportedCredentialTypesJson.length > 3 && (
                          <Badge variant="ghost">+{connector.supportedCredentialTypesJson.length - 3}</Badge>
                        )}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
