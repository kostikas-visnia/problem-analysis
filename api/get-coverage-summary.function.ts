/**
 * App function: anomaly-detection coverage summary.
 *
 * Returns, per entity category (hosts, process groups, services, applications):
 * total entity count, how many are explicitly covered (entity/host-group scoped
 * objects or matched metric-event/Davis detectors), and how many are effectively
 * covered (explicit + environment-level defaults).
 */

import {
  CATEGORIES,
  fetchEntities,
  fetchAllSettingsObjects,
  fetchDetectorObjects,
  resolveDetectorMatches,
  bucketByScope,
  classifyEntity,
  CategoryKey,
} from "./shared/anomalyDetection";

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
  /** Non-fatal warnings (e.g. unavailable data sources) to show in the UI. */
  diagnostics: string[];
  generatedAt: string;
}

export default async function (): Promise<CoverageSummaryResponse> {
  const diagnostics: string[] = [];

  // Detector objects (metric events + Davis) are environment-wide; resolve once.
  let detectorMatches: ReturnType<typeof resolveDetectorMatches> = [];
  try {
    const detectorObjects = await fetchDetectorObjects();
    detectorMatches = resolveDetectorMatches(detectorObjects);
  } catch (error) {
    diagnostics.push(
      `Could not load detectors: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const categories: CategorySummary[] = [];

  for (const cat of CATEGORIES) {
    const outcome = await fetchEntities(cat);
    for (const err of outcome.errors) {
      diagnostics.push(`${cat.label}: ${err}`);
    }

    let objects: Awaited<ReturnType<typeof fetchAllSettingsObjects>> = [];
    try {
      objects = await fetchAllSettingsObjects(cat.directSchemaIds);
    } catch (error) {
      diagnostics.push(
        `${cat.label}: could not load settings (${error instanceof Error ? error.message : "unknown error"})`,
      );
    }
    const buckets = bucketByScope(objects);

    let explicitCovered = 0;
    let effectiveCovered = 0;
    for (const entity of outcome.entities) {
      const cov = classifyEntity(entity, cat, buckets, detectorMatches);
      if (cov.isExplicitlyCovered) explicitCovered++;
      if (cov.isEffectivelyCovered) effectiveCovered++;
    }

    categories.push({
      key: cat.key,
      label: cat.label,
      total: outcome.entities.length,
      explicitCovered,
      effectiveCovered,
      hasEnvironmentDefault: buckets.environment.length > 0,
      entitySource: outcome.source,
    });
  }

  return {
    categories,
    diagnostics: Array.from(new Set(diagnostics)),
    generatedAt: new Date().toISOString(),
  };
}
