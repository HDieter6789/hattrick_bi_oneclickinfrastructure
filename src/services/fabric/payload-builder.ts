import type { FabricParameterSchema } from "@/generated/prisma/client";

/**
 * Turns resolved parameter values (from the Dynamic Parameter Engine) into
 * the actual Fabric API request body, using each FabricParameterSchema's
 * `targetPath` (dot-notation, e.g. "creationPayload.enableSchemas") to
 * place the value. This is what keeps the generic form renderer generic —
 * no item-type-specific payload-shaping code exists anywhere else.
 */
export function buildFabricPayload(
  parameterSchemas: Pick<FabricParameterSchema, "key" | "targetPath">[],
  values: Record<string, unknown>,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = structuredClone(base);

  for (const schema of parameterSchemas) {
    if (!(schema.key in values)) continue;
    const value = values[schema.key];
    if (value === undefined || value === "") continue;
    setPath(payload, schema.targetPath, value);
  }

  return payload;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (typeof cursor[segment] !== "object" || cursor[segment] === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

/** Merges BASIC + ADVANCED mode values with a RAW definition override, if
 * present. RAW always wins for whichever keys it defines — this backs the
 * three configuration modes from brief section 7. */
export function mergeConfigurationModes(
  basicAndAdvanced: Record<string, unknown>,
  raw?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!raw) return basicAndAdvanced;
  return { ...basicAndAdvanced, ...raw };
}
