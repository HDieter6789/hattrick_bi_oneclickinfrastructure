/**
 * Dependency graph utilities for DesiredResource[] (brief section 10).
 * Framework-free, deterministic, and unit-tested in isolation
 * (tests/unit/dag.test.ts) — this is the one piece of the provisioning
 * engine that must be provably correct: a bad topological order or an
 * undetected cycle could create Fabric resources in the wrong sequence.
 */

export interface DagNode {
  logicalName: string;
  dependsOn: string[];
}

export class CircularDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(" -> ")}`);
    this.name = "CircularDependencyError";
  }
}

export class UnknownDependencyError extends Error {
  constructor(
    public readonly node: string,
    public readonly missingDependency: string,
  ) {
    super(`Resource "${node}" depends on unknown resource "${missingDependency}"`);
    this.name = "UnknownDependencyError";
  }
}

/** Kahn's algorithm. Returns logicalNames in an order where every
 * dependency appears before its dependents. Throws CircularDependencyError
 * or UnknownDependencyError rather than silently producing a partial or
 * wrong order. */
export function topologicalSort(nodes: DagNode[]): string[] {
  const byName = new Map(nodes.map((n) => [n.logicalName, n]));
  const inDegree = new Map<string, number>(nodes.map((n) => [n.logicalName, 0]));
  const dependents = new Map<string, string[]>(nodes.map((n) => [n.logicalName, []]));

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const depNode = byName.get(dep);
      if (!depNode) throw new UnknownDependencyError(node.logicalName, dep);
      inDegree.set(node.logicalName, (inDegree.get(node.logicalName) ?? 0) + 1);
      dependents.get(dep)!.push(node.logicalName);
    }
  }

  const queue: string[] = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([name]) => name);
  queue.sort(); // deterministic ordering among independent nodes
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    const next = [...dependents.get(current)!].sort();
    for (const dependent of next) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
    queue.sort();
  }

  if (order.length !== nodes.length) {
    throw new CircularDependencyError(findCycle(nodes));
  }

  return order;
}

/** DFS-based cycle extraction, used only to produce a helpful error message
 * once topologicalSort has already determined a cycle exists. */
function findCycle(nodes: DagNode[]): string[] {
  const byName = new Map(nodes.map((n) => [n.logicalName, n]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  function visit(name: string): string[] | null {
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      return [...path.slice(cycleStart), name];
    }
    if (visited.has(name)) return null;

    visiting.add(name);
    path.push(name);
    for (const dep of byName.get(name)?.dependsOn ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    path.pop();
    visiting.delete(name);
    visited.add(name);
    return null;
  }

  for (const node of nodes) {
    const found = visit(node.logicalName);
    if (found) return found;
  }
  return [];
}

/** True/false variant for UI validation (e.g. blueprint editor) that
 * shouldn't throw on every keystroke. */
export function hasCircularDependency(nodes: DagNode[]): boolean {
  try {
    topologicalSort(nodes);
    return false;
  } catch (error) {
    return error instanceof CircularDependencyError;
  }
}

export interface DagEdge {
  source: string;
  target: string;
}

/** Flattens dependsOn[] into a simple edge list — the shape React Flow's
 * viewer (features/provisioning/DependencyGraphView) consumes directly. */
export function toEdgeList(nodes: DagNode[]): DagEdge[] {
  return nodes.flatMap((node) => node.dependsOn.map((dep) => ({ source: dep, target: node.logicalName })));
}
