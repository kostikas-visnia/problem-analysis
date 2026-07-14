/** Response types mirrored from the backend app functions in `/api`. */

export type CategoryKey = "host" | "process" | "service" | "application";

export interface CategorySummary {
  key: CategoryKey;
  label: string;
  total: number;
  explicitCovered: number;
  effectiveCovered: number;
  hasEnvironmentDefault: boolean;
  entitySource: "dql" | "entities-api" | "none";
}

export interface CoverageSummaryResponse {
  categories: CategorySummary[];
  diagnostics: string[];
  generatedAt: string;
}

export interface SettingRef {
  objectId: string;
  schemaId: string;
  summary: string;
  enabled: boolean;
}

export interface EntityDetailRow {
  id: string;
  name: string;
  hostGroupName?: string;
  explicit: SettingRef[];
  inheritedHostGroup: SettingRef[];
  inheritedEnvironment: SettingRef[];
  metricEvents: SettingRef[];
  davisDetectors: SettingRef[];
  isExplicitlyCovered: boolean;
  isEffectivelyCovered: boolean;
}

export interface EntityDetailsResponse {
  type: CategoryKey;
  label: string;
  total: number;
  rows: EntityDetailRow[];
  globalDetectors: {
    metricEvents: SettingRef[];
    davisDetectors: SettingRef[];
  };
  diagnostics: string[];
  generatedAt: string;
}

export interface MetricEventInfo {
  objectId: string;
  name: string;
  enabled: boolean;
  scope: string;
  eventType: string;
  severity: string;
  metric: string;
  aggregation: string;
  model: string;
  samples: string;
  alertOnMissingData: boolean;
  managementZone: string;
  entityFilter: string;
  dimensionFilter: string;
  description: string;
}

export interface DavisDetectorInfo {
  objectId: string;
  name: string;
  enabled: boolean;
  scope: string;
  analyzer: string;
  analyzerInput: string;
  execution: string;
  description: string;
}

export interface DetectorsResponse {
  metricEvents: MetricEventInfo[];
  davisDetectors: DavisDetectorInfo[];
  diagnostics: string[];
  generatedAt: string;
}
