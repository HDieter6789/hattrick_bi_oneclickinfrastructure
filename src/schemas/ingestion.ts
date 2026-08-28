import { z } from "zod";
import { LoadMethod, IngestionScheduleFrequency } from "@/generated/prisma/enums";

export const loadMethodSchema = z.enum(LoadMethod);
export const ingestionScheduleFrequencySchema = z.enum(IngestionScheduleFrequency);

/**
 * Validates the input to `createIngestionConfiguration` (see
 * services/ingestion/ingestion-service.ts). Follows the same `z.input`/
 * `z.infer` split as schemas/fabric-capability.ts: fields with `.default()`
 * are optional on the way in (what a wizard form / API caller submits) and
 * required on the way out (what the service function works with after
 * `.parse()`).
 *
 * This schema is deliberately generic across source connector types — no
 * per-connector shape — so the ingestion wizard UI (owned by another agent)
 * can render one generic form driven by this schema, consistent with the
 * platform's "no per-item-type component" rule (brief section 53).
 */
export const createIngestionConfigurationInput = z
  .object({
    customerId: z.string().min(1),
    infrastructureConfigurationId: z.string().min(1),

    connectionId: z.string().min(1),
    sourceObject: z.string().min(1, "Source table/object/file is required"),

    loadMethod: loadMethodSchema.default("full"),
    watermarkColumn: z.string().min(1).optional(),

    // DesiredResource.logicalName of the destination Lakehouse/table this
    // ingestion loads into, plus the physical destination table name — see
    // IngestionConfiguration.destinationLogicalName in prisma/schema/ingestion.prisma.
    destinationLogicalName: z.string().min(1),
    destinationTable: z.string().min(1).optional(),

    scheduleFrequency: ingestionScheduleFrequencySchema.default("daily"),
  })
  .superRefine((value, ctx) => {
    // CDC relies on Fabric's own change-tracking mechanism, not a polled
    // watermark column, so only "incremental" requires one.
    if (value.loadMethod === "incremental" && !value.watermarkColumn) {
      ctx.addIssue({
        code: "custom",
        path: ["watermarkColumn"],
        message: "watermarkColumn is required when loadMethod is 'incremental'",
      });
    }
  });

/** Post-`.parse()` shape — defaults applied, ready to persist. */
export type CreateIngestionConfigurationInput = z.infer<typeof createIngestionConfigurationInput>;

/** Pre-validation shape — what a wizard form/API caller submits before
 * `.parse()` fills in defaults (loadMethod, scheduleFrequency). */
export type CreateIngestionConfigurationDraft = z.input<typeof createIngestionConfigurationInput>;
