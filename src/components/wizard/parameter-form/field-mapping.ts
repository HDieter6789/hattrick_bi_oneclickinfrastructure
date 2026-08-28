import type { ParameterInputType, ParameterMode } from "@/generated/prisma/enums";

/**
 * Pure Dynamic Parameter Engine helpers — client-safe mirror of the shape
 * `FabricParameterSchema` rows arrive in over `GET /api/fabric-capabilities`.
 * The wizard's Fabric Resources step (`dynamic-parameter-form.tsx`) is the
 * ONE generic form renderer driven by this data (brief section: "no
 * LakehouseForm.tsx/PipelineForm.tsx"); every function here is kept free of
 * React so it can be unit tested in isolation from rendering.
 */

export interface ParameterOptionLike {
  value: string;
  label: string;
}

export interface ParameterSchemaLike {
  key: string;
  label: string;
  description?: string | null;
  inputType: ParameterInputType;
  mode: ParameterMode;
  required: boolean;
  defaultValue?: unknown;
  optionsJson?: unknown;
}

/** Groups a flat parameter schema list into basic/advanced/raw buckets,
 * preserving input order within each bucket — this is what drives the
 * step's Basic/Advanced/Raw tabs. */
export function groupParametersByMode(schemas: ParameterSchemaLike[]): Record<ParameterMode, ParameterSchemaLike[]> {
  const groups: Record<ParameterMode, ParameterSchemaLike[]> = { basic: [], advanced: [], raw: [] };
  for (const schema of schemas) {
    groups[schema.mode].push(schema);
  }
  return groups;
}

/** Normalizes `FabricParameterSchema.optionsJson` (stored as `Json?`, shape
 * `[{ value, label }]` per the Prisma schema comment) into a typed array,
 * tolerating null/malformed data rather than throwing. */
export function parseParameterOptions(optionsJson: unknown): ParameterOptionLike[] {
  if (!Array.isArray(optionsJson)) return [];
  const options: ParameterOptionLike[] = [];
  for (const entry of optionsJson) {
    if (
      entry &&
      typeof entry === "object" &&
      "value" in entry &&
      "label" in entry &&
      typeof (entry as { value: unknown }).value === "string" &&
      typeof (entry as { label: unknown }).label === "string"
    ) {
      options.push({ value: (entry as ParameterOptionLike).value, label: (entry as ParameterOptionLike).label });
    }
  }
  return options;
}

/** The initial value a form control should show for this parameter — the
 * schema's own `defaultValue` when present, otherwise a type-appropriate
 * empty value so every control is always controlled (never `undefined`). */
export function getInitialParameterValue(schema: ParameterSchemaLike): unknown {
  if (schema.defaultValue !== undefined && schema.defaultValue !== null) {
    return schema.defaultValue;
  }
  switch (schema.inputType) {
    case "boolean":
      return false;
    case "multiSelect":
      return [];
    case "number":
      return "";
    case "json":
      return "{}";
    default:
      return "";
  }
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Parses a `json`-mode textarea's raw text, used both to validate on blur
 * and to build the final `resourceParameterOverrides` payload. */
export function parseJsonParameterValue(raw: string): JsonParseResult {
  if (raw.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "Must be valid JSON" };
  }
}

/**
 * Coerces a raw value collected from a generic form control into the type
 * `resourceParameterOverrides[logicalName][key]` should carry. `raw` is
 * whatever the control naturally produces (string from text/number/date
 * inputs, boolean from checkboxes/switches, string[] from multi-select).
 * Returns `{ ok: false }` only for `json` inputs with invalid JSON — every
 * other input type always coerces successfully.
 */
export function coerceParameterValue(inputType: ParameterInputType, raw: unknown): JsonParseResult {
  switch (inputType) {
    case "number": {
      if (raw === "" || raw === null || raw === undefined) return { ok: true, value: undefined };
      const n = Number(raw);
      return { ok: true, value: Number.isNaN(n) ? undefined : n };
    }
    case "boolean":
      return { ok: true, value: Boolean(raw) };
    case "multiSelect":
      return { ok: true, value: Array.isArray(raw) ? raw : [] };
    case "json":
      return parseJsonParameterValue(typeof raw === "string" ? raw : JSON.stringify(raw ?? {}));
    default:
      return { ok: true, value: raw };
  }
}

/** Parameter input types that should render as a searchable picker/combobox
 * rather than a plain control — resourcePicker/workspacePicker/folderPicker/
 * userPicker render generically (free-text id + label), while
 * connectionPicker is special-cased to list the customer's own connections
 * (see dynamic-parameter-form.tsx). */
export const PICKER_INPUT_TYPES: ReadonlySet<ParameterInputType> = new Set([
  "resourcePicker",
  "workspacePicker",
  "folderPicker",
  "connectionPicker",
  "userPicker",
]);
