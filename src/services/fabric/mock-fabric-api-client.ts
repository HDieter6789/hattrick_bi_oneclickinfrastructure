import { randomUUID } from "node:crypto";
import { childLogger } from "@/lib/logger";
import type { FabricApiClient } from "./fabric-api-client";
import type { FabricLroResult, FabricPage } from "./types";

const log = childLogger({ module: "fabric.mock-client" });

interface MockItem {
  id: string;
  [key: string]: unknown;
}

/**
 * In-memory Fabric API simulation used when DEMO_MODE=true. Behaves like a
 * real item store scoped by workspace/path prefix so the provisioning
 * engine's idempotency logic (create → check exists → skip) can be
 * exercised meaningfully without a real Fabric tenant. Never used in
 * production — see services/fabric/index.ts for the selection logic.
 */
export class MockFabricApiClient implements FabricApiClient {
  private readonly store = new Map<string, MockItem[]>();

  async get<T>(path: string): Promise<T> {
    const [collectionPath, id] = this.splitResourcePath(path);
    const items = this.store.get(collectionPath) ?? [];
    const found = id ? items.find((i) => i.id === id) : undefined;
    if (id && !found) {
      const err = new Error(`Mock Fabric item not found: ${path}`) as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return (found ?? { value: items }) as T;
  }

  async getAllPages<T>(path: string): Promise<T[]> {
    return (this.store.get(path) ?? []) as T[];
  }

  async getPage<T>(path: string): Promise<FabricPage<T>> {
    return { items: (this.store.get(path) ?? []) as T[], continuationToken: null };
  }

  async post<T>(path: string, body?: unknown): Promise<FabricLroResult<T>> {
    await simulateLatency();
    const item: MockItem = {
      id: randomUUID(),
      ...(typeof body === "object" && body !== null ? body : {}),
    };
    const items = this.store.get(path) ?? [];
    items.push(item);
    this.store.set(path, items);
    log.debug({ path, id: item.id }, "Mock Fabric item created");
    return { operationId: null, status: "Succeeded", result: item as T, error: null };
  }

  async put<T>(path: string, body?: unknown): Promise<FabricLroResult<T>> {
    return this.upsert<T>(path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<FabricLroResult<T>> {
    return this.upsert<T>(path, body);
  }

  async delete(path: string): Promise<void> {
    const [collectionPath, id] = this.splitResourcePath(path);
    const items = this.store.get(collectionPath) ?? [];
    this.store.set(
      collectionPath,
      items.filter((i) => i.id !== id),
    );
  }

  private async upsert<T>(path: string, body?: unknown): Promise<FabricLroResult<T>> {
    await simulateLatency();
    const [collectionPath, id] = this.splitResourcePath(path);
    const items = this.store.get(collectionPath) ?? [];
    const index = items.findIndex((i) => i.id === id);
    const merged: MockItem = { id: id ?? randomUUID(), ...(typeof body === "object" && body !== null ? body : {}) };
    if (index >= 0) items[index] = { ...items[index], ...merged };
    else items.push(merged);
    this.store.set(collectionPath, items);
    return { operationId: null, status: "Succeeded", result: merged as T, error: null };
  }

  private splitResourcePath(path: string): [string, string | undefined] {
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    const isId = /^[0-9a-f-]{8,}$/i.test(last ?? "");
    return isId ? [segments.slice(0, -1).join("/"), last] : [path, undefined];
  }
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
}
