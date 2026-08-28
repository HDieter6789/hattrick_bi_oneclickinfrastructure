import { describe, expect, it } from "vitest";
import {
  coerceParameterValue,
  getInitialParameterValue,
  groupParametersByMode,
  parseJsonParameterValue,
  parseParameterOptions,
  PICKER_INPUT_TYPES,
  type ParameterSchemaLike,
} from "@/components/wizard/parameter-form/field-mapping";

function schema(overrides: Partial<ParameterSchemaLike> & Pick<ParameterSchemaLike, "key" | "inputType" | "mode">): ParameterSchemaLike {
  return { label: overrides.key, required: false, ...overrides };
}

describe("groupParametersByMode", () => {
  it("buckets schemas by mode, preserving order within each bucket", () => {
    const schemas: ParameterSchemaLike[] = [
      schema({ key: "a", inputType: "text", mode: "basic" }),
      schema({ key: "b", inputType: "text", mode: "advanced" }),
      schema({ key: "c", inputType: "text", mode: "basic" }),
      schema({ key: "d", inputType: "text", mode: "raw" }),
    ];
    const grouped = groupParametersByMode(schemas);
    expect(grouped.basic.map((s) => s.key)).toEqual(["a", "c"]);
    expect(grouped.advanced.map((s) => s.key)).toEqual(["b"]);
    expect(grouped.raw.map((s) => s.key)).toEqual(["d"]);
  });

  it("returns empty arrays for modes with no schemas", () => {
    const grouped = groupParametersByMode([]);
    expect(grouped).toEqual({ basic: [], advanced: [], raw: [] });
  });
});

describe("parseParameterOptions", () => {
  it("extracts valid {value,label} entries", () => {
    const options = parseParameterOptions([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ]);
    expect(options).toEqual([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ]);
  });

  it("tolerates malformed/missing data instead of throwing", () => {
    expect(parseParameterOptions(null)).toEqual([]);
    expect(parseParameterOptions(undefined)).toEqual([]);
    expect(parseParameterOptions("not-an-array")).toEqual([]);
    expect(parseParameterOptions([{ value: "a" }, { label: "no value" }, 42])).toEqual([]);
  });
});

describe("getInitialParameterValue", () => {
  it("uses the schema's defaultValue when present", () => {
    expect(getInitialParameterValue(schema({ key: "k", inputType: "text", mode: "basic", defaultValue: "hello" }))).toBe("hello");
    expect(getInitialParameterValue(schema({ key: "k", inputType: "boolean", mode: "basic", defaultValue: true }))).toBe(true);
  });

  it("falls back to a type-appropriate empty value", () => {
    expect(getInitialParameterValue(schema({ key: "k", inputType: "boolean", mode: "basic" }))).toBe(false);
    expect(getInitialParameterValue(schema({ key: "k", inputType: "multiSelect", mode: "basic" }))).toEqual([]);
    expect(getInitialParameterValue(schema({ key: "k", inputType: "number", mode: "basic" }))).toBe("");
    expect(getInitialParameterValue(schema({ key: "k", inputType: "json", mode: "basic" }))).toBe("{}");
    expect(getInitialParameterValue(schema({ key: "k", inputType: "text", mode: "basic" }))).toBe("");
  });
});

describe("parseJsonParameterValue", () => {
  it("parses valid JSON", () => {
    expect(parseJsonParameterValue('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("treats blank input as an empty object", () => {
    expect(parseJsonParameterValue("   ")).toEqual({ ok: true, value: {} });
  });

  it("reports invalid JSON without throwing", () => {
    const result = parseJsonParameterValue("{not valid");
    expect(result.ok).toBe(false);
  });
});

describe("coerceParameterValue", () => {
  it("coerces number inputs, dropping empty/invalid values", () => {
    expect(coerceParameterValue("number", "42")).toEqual({ ok: true, value: 42 });
    expect(coerceParameterValue("number", "")).toEqual({ ok: true, value: undefined });
    expect(coerceParameterValue("number", "not-a-number")).toEqual({ ok: true, value: undefined });
  });

  it("coerces boolean inputs", () => {
    expect(coerceParameterValue("boolean", true)).toEqual({ ok: true, value: true });
    expect(coerceParameterValue("boolean", undefined)).toEqual({ ok: true, value: false });
  });

  it("coerces multiSelect to an array, defaulting non-arrays to []", () => {
    expect(coerceParameterValue("multiSelect", ["a", "b"])).toEqual({ ok: true, value: ["a", "b"] });
    expect(coerceParameterValue("multiSelect", "a")).toEqual({ ok: true, value: [] });
  });

  it("coerces json inputs via parseJsonParameterValue", () => {
    expect(coerceParameterValue("json", '{"x":1}')).toEqual({ ok: true, value: { x: 1 } });
    expect(coerceParameterValue("json", "{bad").ok).toBe(false);
  });

  it("passes through every other input type verbatim", () => {
    expect(coerceParameterValue("text", "hello")).toEqual({ ok: true, value: "hello" });
    expect(coerceParameterValue("password", "secret")).toEqual({ ok: true, value: "secret" });
    expect(coerceParameterValue("connectionPicker", "conn-1")).toEqual({ ok: true, value: "conn-1" });
  });
});

describe("PICKER_INPUT_TYPES", () => {
  it("contains exactly the picker input types other than connectionPicker's dedicated handling", () => {
    expect(PICKER_INPUT_TYPES.has("resourcePicker")).toBe(true);
    expect(PICKER_INPUT_TYPES.has("workspacePicker")).toBe(true);
    expect(PICKER_INPUT_TYPES.has("folderPicker")).toBe(true);
    expect(PICKER_INPUT_TYPES.has("userPicker")).toBe(true);
    expect(PICKER_INPUT_TYPES.has("connectionPicker")).toBe(true);
    expect(PICKER_INPUT_TYPES.has("text")).toBe(false);
  });
});
