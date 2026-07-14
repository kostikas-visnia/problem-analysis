/**
 * App function: per-entity anomaly-detection details for one category.
 *
 * Payload: { type: "host" | "process" | "service" | "application" }
 *
 * Returns each entity with the anomaly-detection objects that apply to it
 * (explicit, inherited from host group / environment, and matched metric-event /
 * Davis detectors), plus a list of detectors that could not be attributed to a
 * specific entity (treated as environment-wide).
 */

import {
  getCategory,
  fetchEntities,
  fetchAllSettingsObjects,
  fetchDetectorObjects,
  resolveDetectorMatches,
  bucketByScope,
  classifyEntity,
  CategoryKey,
} from "./shared/anomalyDetection";

interface SettingRef {
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
  /** Detectors that apply environment-wide (no resolvable per-entity selector). */
  globalDetectors: {
    metricEvents: SettingRef[];
    davisDetectors: SettingRef[];
  };
  /** Non-fatal warnings (e.g. unavailable data sources) to show in the UI. */
  diagnostics: string[];
  generatedAt: string;
}

interface Payload {
  type?: string;
}

function toRef(o: {
  objectId: string;
  schemaId: string;
  summary: string;
  enabled: boolean;
}): SettingRef {
  return {
    objectId: o.objectId,
    schemaId: o.schemaId,
    summary: o.summary,
    enabled: o.enabled,
  };
}

export default async function (
  payload: Payload = {},
): Promise<EntityDetailsResponse> {
  const cat = getCategory(payload.type ?? "");
  if (!cat) {
    throw new Error(
      `Unknown entity type "${payload.type}". Expected one of: host, process, service, application.`,
    );
  }

  const diagnostics: string[] = [];

  const [outcome, objects, detectorObjects] = await Promise.all([
    fetchEntities(cat),
    fetchAllSettingsObjects(cat.directSchemaIds).catch((error: unknown) => {
      diagnostics.push(
        `Could not load settings: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return [];
    }),
    fetchDetectorObjects().catch((error: unknown) => {
      diagnostics.push(
        `Could not load detectors: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return [];
    }),
  ]);

  const entities = outcome.entities;
  diagnostics.push(...outcome.errors);

  const buckets = bucketByScope(objects);
  const detectorMatches = resolveDetectorMatches(detectorObjects);

  const rows: EntityDetailRow[] = entities.map((entity) => {
    const cov = classifyEntity(entity, cat, buckets, detectorMatches);
    return {
      id: entity.id,
      name: entity.name,
      hostGroupName: entity.hostGroupName,
      explicit: cov.explicit.map(toRef),
      inheritedHostGroup: cov.hostGroup.map(toRef),
      inheritedEnvironment: cov.environment.map(toRef),
      metricEvents: cov.metricEvents.map(toRef),
      davisDetectors: cov.davis.map(toRef),
      isExplicitlyCovered: cov.isExplicitlyCovered,
      isEffectivelyCovered: cov.isEffectivelyCovered,
    };
  });

  const globalMetricEvents: SettingRef[] = [];
  const globalDavis: SettingRef[] = [];
  for (const m of detectorMatches) {
    if (!m.global) continue;
    (m.kind === "davis" ? globalDavis : globalMetricEvents).push(toRef(m.object));
  }

  // Sort: covered entities first, then by name, for a useful default view.
  rows.sort((a, b) => {
    if (a.isExplicitlyCovered !== b.isExplicitlyCovered) {
      return a.isExplicitlyCovered ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    type: cat.key,
    label: cat.label,
    total: entities.length,
    rows,
    globalDetectors: {
      metricEvents: globalMetricEvents,
      davisDetectors: globalDavis,
    },
    diagnostics: Array.from(new Set(diagnostics)),
    generatedAt: new Date().toISOString(),
  };
}
