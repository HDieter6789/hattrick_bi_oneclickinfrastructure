import { z } from "zod";

export const parameterInputTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multiSelect",
  "json",
  "password",
  "resourcePicker",
  "workspacePicker",
  "folderPicker",
  "connectionPicker",
  "userPicker",
  "date",
  "datetime",
]);

export const parameterModeSchema = z.enum(["basic", "advanced", "raw"]);

export const fabricParameterOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const fabricParameterSchemaInput = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  inputType: parameterInputTypeSchema,
  mode: parameterModeSchema.default("basic"),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  options: z.array(fabricParameterOptionSchema).optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      enum: z.array(z.string()).optional(),
    })
    .optional(),
  targetPath: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

export const fabricCapabilityCategorySchema = z.enum([
  "storage",
  "compute",
  "pipeline",
  "analytics",
  "realtime",
  "data_science",
  "reporting",
  "governance",
  "other",
]);

export const registerFabricCapabilityInput = z.object({
  itemType: z.string().min(1),
  displayName: z.string().min(1),
  category: fabricCapabilityCategorySchema.default("other"),
  description: z.string().optional(),
  apiPath: z.string().min(1),
  createSupported: z.boolean().default(false),
  updateSupported: z.boolean().default(false),
  deleteSupported: z.boolean().default(false),
  definitionSupported: z.boolean().default(false),
  creationPayloadSupported: z.boolean().default(false),
  folderSupported: z.boolean().default(true),
  servicePrincipalSupported: z.boolean().default(true),
  requiredScopes: z.array(z.string()).default([]),
  documentationUrl: z.url().optional(),
  enabled: z.boolean().default(true),
  parameters: z.array(fabricParameterSchemaInput).default([]),
});

export type RegisterFabricCapabilityInput = z.infer<typeof registerFabricCapabilityInput>;
export type FabricParameterSchemaInput = z.infer<typeof fabricParameterSchemaInput>;

/** Pre-validation shape (defaulted fields optional) — what seed data and
 * form submissions look like before `registerFabricCapabilityInput.parse()`
 * fills in defaults. */
export type RegisterFabricCapabilityDraft = z.input<typeof registerFabricCapabilityInput>;
