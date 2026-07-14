/**
 * App function: full list of metric events and Davis anomaly detectors with rich detail.
 * These are environment-wide anomaly-detection configurations (not scoped per entity).
 */

import {
  fetchAllSettingsObjects,
  toMetricEventInfo,
  toDavisDetectorInfo,
  METRIC_EVENTS_SCHEMA,
  DAVIS_DETECTORS_SCHEMA,
  type MetricEventInfo,
  type DavisDetectorInfo,
} from "./shared/anomalyDetection";

export interface DetectorsResponse {
  metricEvents: MetricEventInfo[];
  davisDetectors: DavisDetectorInfo[];
  diagnostics: string[];
  generatedAt: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export default async function (): Promise<DetectorsResponse> {
  const diagnostics: string[] = [];

  const [metricObjects, davisObjects] = await Promise.all([
    fetchAllSettingsObjects([METRIC_EVENTS_SCHEMA]).catch((error: unknown) => {
      diagnostics.push(`Could not load metric events: ${message(error)}`);
      return [];
    }),
    fetchAllSettingsObjects([DAVIS_DETECTORS_SCHEMA]).catch((error: unknown) => {
      diagnostics.push(`Could not load Davis detectors: ${message(error)}`);
      return [];
    }),
  ]);

  const metricEvents = metricObjects
    .map(toMetricEventInfo)
    .sort((a, b) => a.name.localeCompare(b.name));
  const davisDetectors = davisObjects
    .map(toDavisDetectorInfo)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    metricEvents,
    davisDetectors,
    diagnostics: Array.from(new Set(diagnostics)),
    generatedAt: new Date().toISOString(),
  };
}
