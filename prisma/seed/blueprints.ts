/**
 * Blueprints are data, not hardcoded UI (brief section 11). This seed
 * covers the eight blueprints named in the brief. Each `resources` entry
 * becomes a BlueprintResource row; `dependsOn` references other
 * resources' `logicalName` within the same blueprint.
 */

export interface BlueprintResourceSeed {
  itemType: string;
  logicalName: string;
  displayNameTemplate: string;
  configuration?: Record<string, unknown>;
  dependsOn?: string[];
  optional?: boolean;
  layer?: "bronze" | "silver" | "gold";
  sortOrder: number;
}

export interface BlueprintSeed {
  key: string;
  name: string;
  description: string;
  pattern: "simple" | "medallion" | "enterprise" | "custom";
  resources: BlueprintResourceSeed[];
}

export const blueprintSeed: BlueprintSeed[] = [
  {
    key: "blank",
    name: "Blank",
    description: "An empty workspace with no pre-configured resources — build up manually.",
    pattern: "custom",
    resources: [],
  },
  {
    key: "basic-lakehouse",
    name: "Basic Lakehouse",
    description: "A single Lakehouse for straightforward, single-layer data platforms.",
    pattern: "simple",
    resources: [
      { itemType: "Lakehouse", logicalName: "lakehouse", displayNameTemplate: "{customer}_{environment}_lh", sortOrder: 0 },
    ],
  },
  {
    key: "medallion",
    name: "Medallion",
    description: "Bronze/Silver/Gold layered architecture with ingestion and transformation.",
    pattern: "medallion",
    resources: [
      { itemType: "Lakehouse", logicalName: "bronze", displayNameTemplate: "{customer}_{environment}_brz_lh", layer: "bronze", sortOrder: 0 },
      { itemType: "Lakehouse", logicalName: "silver", displayNameTemplate: "{customer}_{environment}_slv_lh", layer: "silver", sortOrder: 1 },
      { itemType: "Lakehouse", logicalName: "gold", displayNameTemplate: "{customer}_{environment}_gld_lh", layer: "gold", sortOrder: 2 },
      {
        itemType: "DataPipeline",
        logicalName: "ingest_pipeline",
        displayNameTemplate: "{customer}_{environment}_ingest_pl",
        dependsOn: ["bronze"],
        sortOrder: 3,
      },
      {
        itemType: "Notebook",
        logicalName: "silver_transform",
        displayNameTemplate: "{customer}_{environment}_slv_transform_nb",
        dependsOn: ["bronze", "silver"],
        sortOrder: 4,
      },
      {
        itemType: "Notebook",
        logicalName: "gold_transform",
        displayNameTemplate: "{customer}_{environment}_gld_transform_nb",
        dependsOn: ["silver", "gold"],
        sortOrder: 5,
      },
      {
        itemType: "SemanticModel",
        logicalName: "semantic_model",
        displayNameTemplate: "{customer}_{environment}_gld_model",
        dependsOn: ["gold"],
        optional: true,
        layer: "gold",
        sortOrder: 6,
      },
    ],
  },
  {
    key: "data-warehouse",
    name: "Data Warehouse",
    description: "Warehouse-centric platform for teams standardizing on T-SQL.",
    pattern: "custom",
    resources: [
      { itemType: "Lakehouse", logicalName: "bronze", displayNameTemplate: "{customer}_{environment}_brz_lh", layer: "bronze", sortOrder: 0 },
      { itemType: "Warehouse", logicalName: "gold", displayNameTemplate: "{customer}_{environment}_gld_wh", layer: "gold", sortOrder: 1 },
      {
        itemType: "DataPipeline",
        logicalName: "ingest_pipeline",
        displayNameTemplate: "{customer}_{environment}_ingest_pl",
        dependsOn: ["bronze"],
        sortOrder: 2,
      },
      {
        itemType: "Notebook",
        logicalName: "warehouse_load",
        displayNameTemplate: "{customer}_{environment}_wh_load_nb",
        dependsOn: ["bronze", "gold"],
        sortOrder: 3,
      },
    ],
  },
  {
    key: "power-bi-analytics",
    name: "Power BI Analytics",
    description: "Gold Lakehouse with semantic model and starter report, optimized for reporting-first customers.",
    pattern: "custom",
    resources: [
      { itemType: "Lakehouse", logicalName: "gold", displayNameTemplate: "{customer}_{environment}_gld_lh", layer: "gold", sortOrder: 0 },
      {
        itemType: "DataPipeline",
        logicalName: "ingest_pipeline",
        displayNameTemplate: "{customer}_{environment}_ingest_pl",
        dependsOn: ["gold"],
        sortOrder: 1,
      },
      {
        itemType: "SemanticModel",
        logicalName: "semantic_model",
        displayNameTemplate: "{customer}_{environment}_gld_model",
        dependsOn: ["gold"],
        layer: "gold",
        sortOrder: 2,
      },
      {
        itemType: "Report",
        logicalName: "starter_report",
        displayNameTemplate: "{customer}_{environment}_starter_rpt",
        dependsOn: ["semantic_model"],
        optional: true,
        layer: "gold",
        sortOrder: 3,
      },
    ],
  },
  {
    key: "realtime-analytics",
    name: "Realtime Analytics",
    description: "Eventstream + Eventhouse/KQL pipeline for streaming data sources.",
    pattern: "custom",
    resources: [
      { itemType: "Eventstream", logicalName: "eventstream", displayNameTemplate: "{customer}_{environment}_es", sortOrder: 0 },
      { itemType: "Eventhouse", logicalName: "eventhouse", displayNameTemplate: "{customer}_{environment}_eh", sortOrder: 1 },
      {
        itemType: "KQLDatabase",
        logicalName: "kql_database",
        displayNameTemplate: "{customer}_{environment}_gld_kqldb",
        dependsOn: ["eventhouse", "eventstream"],
        layer: "gold",
        sortOrder: 2,
      },
      {
        itemType: "KQLDashboard",
        logicalName: "kql_dashboard",
        displayNameTemplate: "{customer}_{environment}_dashboard",
        dependsOn: ["kql_database"],
        optional: true,
        layer: "gold",
        sortOrder: 3,
      },
    ],
  },
  {
    key: "data-science",
    name: "Data Science",
    description: "Lakehouse + Environment + Notebook stack for exploratory/ML workloads.",
    pattern: "custom",
    resources: [
      { itemType: "Lakehouse", logicalName: "gold", displayNameTemplate: "{customer}_{environment}_gld_lh", layer: "gold", sortOrder: 0 },
      { itemType: "Environment", logicalName: "environment", displayNameTemplate: "{customer}_{environment}_env", sortOrder: 1 },
      {
        itemType: "Notebook",
        logicalName: "exploration",
        displayNameTemplate: "{customer}_{environment}_explore_nb",
        dependsOn: ["gold", "environment"],
        sortOrder: 2,
      },
    ],
  },
  {
    key: "enterprise-data-platform",
    name: "Enterprise Data Platform",
    description: "Full medallion architecture plus semantic model, starter report and monitoring — the most complete starting point.",
    pattern: "enterprise",
    resources: [
      { itemType: "Lakehouse", logicalName: "bronze", displayNameTemplate: "{customer}_{environment}_brz_lh", layer: "bronze", sortOrder: 0 },
      { itemType: "Lakehouse", logicalName: "silver", displayNameTemplate: "{customer}_{environment}_slv_lh", layer: "silver", sortOrder: 1 },
      { itemType: "Lakehouse", logicalName: "gold", displayNameTemplate: "{customer}_{environment}_gld_lh", layer: "gold", sortOrder: 2 },
      {
        itemType: "DataPipeline",
        logicalName: "ingest_pipeline",
        displayNameTemplate: "{customer}_{environment}_ingest_pl",
        dependsOn: ["bronze"],
        sortOrder: 3,
      },
      {
        itemType: "Notebook",
        logicalName: "silver_transform",
        displayNameTemplate: "{customer}_{environment}_slv_transform_nb",
        dependsOn: ["bronze", "silver"],
        sortOrder: 4,
      },
      {
        itemType: "Notebook",
        logicalName: "gold_transform",
        displayNameTemplate: "{customer}_{environment}_gld_transform_nb",
        dependsOn: ["silver", "gold"],
        sortOrder: 5,
      },
      {
        itemType: "SemanticModel",
        logicalName: "semantic_model",
        displayNameTemplate: "{customer}_{environment}_gld_model",
        dependsOn: ["gold"],
        layer: "gold",
        sortOrder: 6,
      },
      {
        itemType: "Report",
        logicalName: "starter_report",
        displayNameTemplate: "{customer}_{environment}_starter_rpt",
        dependsOn: ["semantic_model"],
        optional: true,
        layer: "gold",
        sortOrder: 7,
      },
    ],
  },
];
