import type { ArchitecturePattern, RollbackPolicy } from "@/generated/prisma/enums";

/**
 * Shared client-side shapes for the provisioning wizard. Deliberately plain
 * data (no Prisma client types) so every step component and pure-logic
 * helper can import this without pulling anything server-only into the
 * bundle — same convention as src/features/provisioning/dag-types.ts.
 */

export interface WizardCustomer {
  id: string;
  companyName: string;
}

export interface WizardBlueprintResource {
  id: string;
  itemType: string;
  logicalName: string;
  displayNameTemplate: string;
  configuration: Record<string, unknown>;
  dependsOn: string[];
  optional: boolean;
  layer: string | null;
  sortOrder: number;
}

export interface WizardBlueprint {
  id: string;
  key: string;
  name: string;
  description: string | null;
  pattern: ArchitecturePattern;
  resources: WizardBlueprintResource[];
}

export interface WizardConnectionSummary {
  id: string;
  displayName: string;
  connectorTypeKey: string;
}

/** Accumulated wizard state — a single object threaded through every step,
 * per the brief's guidance that a `useState<number>` step index plus one
 * accumulator object is sufficient here (no need for a heavier state
 * library). Each step only writes the slice it owns. */
export interface WizardData {
  customerId: string | null;
  customerName: string | null;
  blueprint: WizardBlueprint | null;
  configurationId: string | null;
  configurationName: string | null;
  /** Raw (pre-coercion) form values for the Fabric Resources step:
   * logicalName -> paramKey -> value. Kept here (not local step state) so
   * navigating back to an earlier step never loses what was entered. */
  resourceParameterValues: Record<string, Record<string, unknown>>;
  connections: WizardConnectionSummary[];
  userAccessEmails: string[];
  appointmentId: string | null;
  appointmentStatus: string | null;
  rollbackPolicy: RollbackPolicy;
}

export const INITIAL_WIZARD_DATA: WizardData = {
  customerId: null,
  customerName: null,
  blueprint: null,
  configurationId: null,
  configurationName: null,
  resourceParameterValues: {},
  connections: [],
  userAccessEmails: [],
  appointmentId: null,
  appointmentStatus: null,
  rollbackPolicy: "KEEP_SUCCESSFUL_RESOURCES",
};

export const WIZARD_STEPS = [
  "Customer",
  "Architecture",
  "Fabric Resources",
  "Data Sources",
  "Data Ingestion",
  "Self-Service",
  "Monitoring",
  "User Access",
  "Appointment",
  "Review",
  "Create",
] as const;

export type WizardStepLabel = (typeof WIZARD_STEPS)[number];

/** Props every wizard step component receives from the shell. Steps only
 * ever patch the slice of `WizardData` they own via `update`. */
export interface WizardStepProps {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}
