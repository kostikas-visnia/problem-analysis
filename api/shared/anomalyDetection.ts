/**
 * Shared backend logic for computing anomaly-detection coverage of monitored entities.
 *
 * Data sources (run inside the Dynatrace AppEngine JS runtime):
 * - Grail (DQL) via `@dynatrace-sdk/client-query` for entity lists + host-group mapping.
 *   (This is the only entity source that works on Grail-native tenants, where the classic
 *   `/api/v2/entities` REST endpoint returns 404.)
 * - Settings 2.0 objects via `@dynatrace-sdk/client-classic-environment-v2`.
 *
 * Coverage model (see README / app UI):
 * - explicit  : entity has an anomaly-detection object scoped directly to it (entity id),
 *               to its host group, or is targeted by a metric event / Davis detector selector.
 * - effective : explicit OR an environment-level object exists for the entity's type
 *               (environment-level anomaly detection is on by default in Dynatrace).
 */

import { queryExecutionClient } from "@dynatrace-sdk/client-query";
import {
  settingsObjectsClient,
  settingsSchemasClient,
  monitoredEntitiesClient,
  type Entity,
} from "@dynatrace-sdk/client-classic-environment-v2";

export type CategoryKey = "host" | "process" | "service" | "application";

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  /** Grail entity data objects (`dt.entity.*`) queried via `fetch` (primary source). */
  dqlTypes: string[];
  /** Smartscape-on-Grail node types queried via the `smartscapeNodes` DQL command (fallback). */
  smartscapeTypes: string[];
  /** Classic entity types (e.g. "HOST") for the entities-API fallback source. */
  selectorTypes: string[];
  /** Settings 2.0 schemas that directly configure anomaly detection for this type. */
  directSchemaIds: string[];
  /** Whether host-group scoped objects are inherited by this entity type. */
  usesHostGroup: boolean;
}

/** Settings schemas whose objects target entities via selectors (apply across all types). */
export const METRIC_EVENTS_SCHEMA = "builtin:anomaly-detection.metric-events";
export const DAVIS_DETECTORS_SCHEMA = "builtin:davis.anomaly-detectors";

/**
 * Candidate schema IDs per category. Each schema is queried independently and schemas that
 * don't exist in the target environment are skipped, so this list can include alternatives.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    key: "host",
    label: "Hosts",
    dqlTypes: ["dt.entity.host"],
    smartscapeTypes: ["HOST"],
    selectorTypes: ["HOST"],
    directSchemaIds: ["builtin:anomaly-detection.infrastructure-hosts"],
    usesHostGroup: true,
  },
  {
    key: "process",
    label: "Process groups",
    dqlTypes: ["dt.entity.process_group"],
    smartscapeTypes: ["PROCESS_GROUP"],
    selectorTypes: ["PROCESS_GROUP"],
    directSchemaIds: [
      "builtin:anomaly-detection.process-groups",
      "builtin:anomaly-detection.infrastructure-process-groups",
      "builtin:process-group.monitoring.state",
    ],
    // Host-group scoped process settings are surfaced globally, not attributed per PG.
    usesHostGroup: false,
  },
  {
    key: "service",
    label: "Services",
    dqlTypes: ["dt.entity.service"],
    smartscapeTypes: ["SERVICE"],
    selectorTypes: ["SERVICE"],
    directSchemaIds: ["builtin:anomaly-detection.services"],
    usesHostGroup: false,
  },
  {
    key: "application",
    label: "Applications",
    dqlTypes: [
      "dt.entity.application",
      "dt.entity.mobile_application",
      "dt.entity.custom_application",
    ],
    smartscapeTypes: ["APPLICATION", "MOBILE_APPLICATION", "CUSTOM_APPLICATION"],
    selectorTypes: ["APPLICATION", "MOBILE_APPLICATION", "CUSTOM_APPLICATION"],
    directSchemaIds: [
      "builtin:anomaly-detection.rum-web",
      "builtin:anomaly-detection.rum-mobile",
      "builtin:anomaly-detection.rum-custom",
      "builtin:anomaly-detection.applications",
    ],
    usesHostGroup: false,
  },
];

export interface EntityRecord {
  id: string;
  name: string;
  hostGroupId?: string;
  hostGroupName?: string;
}

export interface SettingsObjectLite {
  objectId: string;
  schemaId: string;
  scope: string;
  summary: string;
  enabled: boolean;
  value: Record<string, unknown>;
}

export function getCategory(key: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

/** Safely coerces an unknown scalar (e.g. a DQL field value) to a string. */
function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Runs a DQL query and returns its records, polling until the query finishes. */
async function runDql(query: string): Promise<Record<string, unknown>[]> {
  const start = await queryExecutionClient.queryExecute({
    body: { query, requestTimeoutMilliseconds: 30000, fetchTimeoutSeconds: 60 },
  });

  let state = start.state;
  let result = start.result;
  const token = start.requestToken;

  let guard = 0;
  while ((state === "NOT_STARTED" || state === "RUNNING") && token && guard < 60) {
    guard++;
    const poll = await queryExecutionClient.queryPoll({
      requestToken: token,
      requestTimeoutMilliseconds: 30000,
    });
    state = poll.state;
    result = poll.result;
  }

  if (state !== "SUCCEEDED" || !result) {
    return [];
  }
  return (result.records ?? []).filter(
    (r): r is Record<string, unknown> => r != null,
  );
}

/** Extracts a HOST_GROUP-... id from an arbitrary DQL relationship value (string or array). */
function firstHostGroupId(value: unknown): string | undefined {
  const match = /HOST_GROUP-[0-9A-Fa-f]{16}/.exec(JSON.stringify(value ?? ""));
  return match ? match[0] : undefined;
}

/**
 * Fetches the entity list for a category via the `fetch dt.entity.*` DQL command (Grail
 * topology). Throws on DQL errors so the caller can fall back. This is the primary source.
 */
async function fetchEntitiesViaEntityDql(cat: CategoryDef): Promise<EntityRecord[]> {
  const byId = new Map<string, EntityRecord>();

  for (const type of cat.dqlTypes) {
    const records = await runDql(
      `fetch ${type} | fields id, name = entity.name | limit 50000`,
    );
    for (const r of records) {
      const id = str(r.id);
      if (!id) continue;
      byId.set(id, { id, name: str(r.name) || id });
    }
  }

  // Best-effort host-group enrichment for hosts (used for inheritance).
  if (cat.usesHostGroup && cat.dqlTypes.includes("dt.entity.host")) {
    try {
      const hg = await runDql(
        "fetch dt.entity.host " +
          "| fieldsAdd hostGroup = belongs_to[dt.entity.host_group] | fields id, hostGroup | limit 50000",
      );
      for (const r of hg) {
        const existing = byId.get(str(r.id));
        if (!existing) continue;
        const hostGroupId = firstHostGroupId(r.hostGroup);
        if (hostGroupId) {
          existing.hostGroupId = hostGroupId;
          existing.hostGroupName = hostGroupId;
        }
      }
    } catch {
      // Host-group relationship unavailable; inheritance is skipped.
    }
  }

  return Array.from(byId.values());
}

/**
 * Fetches the entity list for a category via the `smartscapeNodes` DQL command
 * (Smartscape on Grail). Throws on DQL errors so the caller can fall back.
 */
async function fetchEntitiesViaSmartscape(cat: CategoryDef): Promise<EntityRecord[]> {
  const byId = new Map<string, EntityRecord>();

  for (const type of cat.smartscapeTypes) {
    // Host nodes expose their host group via `dt.host_group.id` (used for inheritance).
    const query = cat.usesHostGroup
      ? `smartscapeNodes "${type}" | fields id, name, hostGroupId = \`dt.host_group.id\` | limit 50000`
      : `smartscapeNodes "${type}" | fields id, name | limit 50000`;

    const records = await runDql(query);
    for (const r of records) {
      const id = str(r.id);
      if (!id) continue;
      const record: EntityRecord = { id, name: str(r.name) || id };
      const hostGroupId = str(r.hostGroupId);
      if (hostGroupId) {
        record.hostGroupId = hostGroupId;
        record.hostGroupName = hostGroupId;
      }
      byId.set(id, record);
    }
  }

  return Array.from(byId.values());
}

/** Extracts the host-group id from an entity's relationship maps (any relationship name). */
function extractHostGroupId(entity: Entity): string | undefined {
  for (const rels of [entity.fromRelationships, entity.toRelationships]) {
    if (!rels) continue;
    for (const refs of Object.values(rels)) {
      for (const ref of refs ?? []) {
        if (ref?.type === "HOST_GROUP" && ref.id) return ref.id;
      }
    }
  }
  return undefined;
}

/** Fetches the entity list for a category via the classic monitored-entities API. */
async function fetchEntitiesViaApi(cat: CategoryDef): Promise<EntityRecord[]> {
  const byId = new Map<string, EntityRecord>();
  const wantHostGroup = cat.usesHostGroup;

  for (const type of cat.selectorTypes) {
    const fields =
      wantHostGroup && type === "HOST"
        ? "+fromRelationships,+toRelationships"
        : undefined;

    let nextPageKey: string | undefined;
    let guard = 0;
    do {
      guard++;
      const res: Awaited<ReturnType<typeof monitoredEntitiesClient.getEntities>> =
        nextPageKey
          ? await monitoredEntitiesClient.getEntities({ nextPageKey })
          : await monitoredEntitiesClient.getEntities({
              entitySelector: `type("${type}")`,
              from: "now-72h",
              pageSize: 1000,
              fields,
            });
      for (const e of res.entities ?? []) {
        const id = e.entityId;
        if (!id) continue;
        const record: EntityRecord = { id, name: e.displayName ?? id };
        if (wantHostGroup && type === "HOST") {
          record.hostGroupId = extractHostGroupId(e);
          record.hostGroupName = record.hostGroupId;
        }
        byId.set(id, record);
      }
      nextPageKey = res.nextPageKey ?? undefined;
    } while (nextPageKey && guard < 50);
  }

  return Array.from(byId.values());
}

export interface EntityFetchOutcome {
  entities: EntityRecord[];
  /** Which data source produced the list. */
  source: "dql" | "entities-api" | "none";
  /** Human-readable errors encountered while trying each source. */
  errors: string[];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown error";
}

/**
 * Fetches the entity list for a category, trying `fetch dt.entity.*` (Grail topology) first,
 * then the `smartscapeNodes` command (Smartscape on Grail), then the classic monitored-entities
 * API. Never throws; failures are reported in `errors` so the caller can surface a diagnostic
 * instead of crashing.
 */
export async function fetchEntities(cat: CategoryDef): Promise<EntityFetchOutcome> {
  const errors: string[] = [];

  try {
    const entities = await fetchEntitiesViaEntityDql(cat);
    return { entities, source: "dql", errors };
  } catch (error) {
    errors.push(`Entity topology (DQL) unavailable (${errorMessage(error)})`);
  }

  try {
    const entities = await fetchEntitiesViaSmartscape(cat);
    return { entities, source: "dql", errors };
  } catch (error) {
    errors.push(`Smartscape (DQL) unavailable (${errorMessage(error)})`);
  }

  try {
    const entities = await fetchEntitiesViaApi(cat);
    return { entities, source: "entities-api", errors };
  } catch (error) {
    errors.push(`Entities API unavailable (${errorMessage(error)})`);
  }

  return { entities: [], source: "none", errors };
}

/** Paginates all settings objects for a single schema id. */
async function fetchSettingsObjectsForSchema(
  schemaId: string,
): Promise<SettingsObjectLite[]> {
  const items: SettingsObjectLite[] = [];
  let nextPageKey: string | undefined;
  let guard = 0;

  do {
    guard++;
    const res: Awaited<ReturnType<typeof settingsObjectsClient.getSettingsObjects>> =
      nextPageKey
        ? await settingsObjectsClient.getSettingsObjects({ nextPageKey })
        : await settingsObjectsClient.getSettingsObjects({
            schemaIds: schemaId,
            fields: "objectId,schemaId,scope,summary,value",
            pageSize: 500,
          });

    for (const o of res.items ?? []) {
      const value = (o.value ?? {}) as Record<string, unknown>;
      items.push({
        objectId: String(o.objectId ?? ""),
        schemaId: String(o.schemaId ?? ""),
        scope: String(o.scope ?? ""),
        summary: String(o.summary ?? o.schemaId ?? ""),
        enabled: value.enabled !== false,
        value,
      });
    }
    nextPageKey = res.nextPageKey ?? undefined;
  } while (nextPageKey && guard < 50);

  return items;
}

let availableSchemaCache: Set<string> | null | undefined;

/**
 * Returns the set of settings schema ids available in the environment, or `null` if the
 * schema list could not be retrieved (in which case callers should try all candidates).
 */
async function getAvailableSchemaIds(): Promise<Set<string> | null> {
  if (availableSchemaCache !== undefined) return availableSchemaCache;
  try {
    const res = await settingsSchemasClient.getAvailableSchemaDefinitions({
      fields: "schemaId",
    });
    availableSchemaCache = new Set(
      (res.items ?? []).map((i) => i.schemaId).filter(Boolean),
    );
  } catch {
    availableSchemaCache = null;
  }
  return availableSchemaCache;
}

/**
 * Fetches settings objects for the given schema ids. Non-existent schemas are filtered out
 * up front (via schema discovery); if discovery is unavailable, each schema is queried
 * independently so an unknown schema is skipped instead of failing the whole request.
 */
export async function fetchAllSettingsObjects(
  schemaIds: string[],
): Promise<SettingsObjectLite[]> {
  const available = await getAvailableSchemaIds();
  const toQuery = available
    ? schemaIds.filter((id) => available.has(id))
    : schemaIds;

  const results = await Promise.all(
    toQuery.map(async (schemaId) => {
      try {
        return await fetchSettingsObjectsForSchema(schemaId);
      } catch {
        // Schema not available or not readable in this environment — skip it.
        return [];
      }
    }),
  );
  return results.flat();
}

export interface ScopeBuckets {
  /** Objects scoped to the whole environment. */
  environment: SettingsObjectLite[];
  /** Objects grouped by their scope id (entity id or host-group id). */
  byScopeId: Map<string, SettingsObjectLite[]>;
}

export function bucketByScope(objects: SettingsObjectLite[]): ScopeBuckets {
  const environment: SettingsObjectLite[] = [];
  const byScopeId = new Map<string, SettingsObjectLite[]>();

  for (const o of objects) {
    if (o.scope === "environment" || o.scope === "tenant") {
      environment.push(o);
      continue;
    }
    const list = byScopeId.get(o.scope) ?? [];
    list.push(o);
    byScopeId.set(o.scope, list);
  }
  return { environment, byScopeId };
}

/**
 * Extracts entity ids referenced via `entityId("...")` inside a settings value.
 * Used for best-effort attribution of metric events / Davis detectors to entities
 * without relying on the (Grail-native-unavailable) entity selector resolution API.
 */
function extractEntityIds(value: unknown): string[] {
  const ids = new Set<string>();
  const json = JSON.stringify(value ?? {});
  const idPattern = /"([A-Z][A-Z0-9_]+-[0-9A-Fa-f]{16})"/g;
  let match: RegExpExecArray | null;
  while ((match = idPattern.exec(json)) !== null) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}

export interface DetectorMatch {
  object: SettingsObjectLite;
  kind: "metric-event" | "davis";
  /** Entity ids this detector targets (empty when no explicit ids could be resolved). */
  matched: Set<string>;
  /** True when the detector could not be attributed to specific entities. */
  global: boolean;
}

/**
 * Resolves metric-event and Davis detector objects to the entity ids they reference.
 * Only explicit `entityId(...)` references are attributed; anything else is treated as
 * environment-wide (global).
 */
export function resolveDetectorMatches(
  objects: SettingsObjectLite[],
): DetectorMatch[] {
  return objects.map((obj) => {
    const kind: DetectorMatch["kind"] = obj.schemaId.startsWith(DAVIS_DETECTORS_SCHEMA)
      ? "davis"
      : "metric-event";
    const matched = new Set(extractEntityIds(obj.value));
    return { object: obj, kind, matched, global: matched.size === 0 };
  });
}

export interface EntityCoverage {
  explicit: SettingsObjectLite[];
  hostGroup: SettingsObjectLite[];
  environment: SettingsObjectLite[];
  metricEvents: SettingsObjectLite[];
  davis: SettingsObjectLite[];
  isExplicitlyCovered: boolean;
  isEffectivelyCovered: boolean;
}

/** Classifies which anomaly-detection objects apply to a single entity. */
export function classifyEntity(
  entity: EntityRecord,
  cat: CategoryDef,
  buckets: ScopeBuckets,
  detectorMatches: DetectorMatch[],
): EntityCoverage {
  const explicit = buckets.byScopeId.get(entity.id) ?? [];
  const hostGroup =
    cat.usesHostGroup && entity.hostGroupId
      ? buckets.byScopeId.get(entity.hostGroupId) ?? []
      : [];
  const environment = buckets.environment;

  const metricEvents: SettingsObjectLite[] = [];
  const davis: SettingsObjectLite[] = [];
  for (const m of detectorMatches) {
    if (m.matched.has(entity.id)) {
      (m.kind === "davis" ? davis : metricEvents).push(m.object);
    }
  }

  const isExplicitlyCovered =
    explicit.length > 0 ||
    hostGroup.length > 0 ||
    metricEvents.length > 0 ||
    davis.length > 0;
  const isEffectivelyCovered = isExplicitlyCovered || environment.length > 0;

  return {
    explicit,
    hostGroup,
    environment,
    metricEvents,
    davis,
    isExplicitlyCovered,
    isEffectivelyCovered,
  };
}

/** Fetches metric-event + Davis detector objects. */
export async function fetchDetectorObjects(): Promise<SettingsObjectLite[]> {
  return fetchAllSettingsObjects([METRIC_EVENTS_SCHEMA, DAVIS_DETECTORS_SCHEMA]);
}

// --- Rich detector details (for the Detectors page) ---------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function summarizeEntityFilter(filter: Record<string, unknown>): string {
  const parts: string[] = [];
  const dimensionKey = str(filter.dimensionKey);
  if (dimensionKey) parts.push(dimensionKey);
  for (const raw of asArray(filter.conditions)) {
    const c = asRecord(raw);
    const text = [str(c.type), str(c.operator), str(c.value)]
      .filter(Boolean)
      .join(" ");
    if (text) parts.push(text);
  }
  return parts.join("; ");
}

function summarizeDimensionFilter(filters: unknown[]): string {
  return filters
    .map((raw) => {
      const d = asRecord(raw);
      return [str(d.dimensionKey), str(d.operator) || "=", str(d.dimensionValue)]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

/** Extracts a rich, table-friendly view of a metric-event settings object. */
export function toMetricEventInfo(o: SettingsObjectLite): MetricEventInfo {
  const value = o.value;
  const query = asRecord(value.queryDefinition);
  const model = asRecord(value.modelProperties);
  const template = asRecord(value.eventTemplate);

  const metric = str(query.metricKey) || str(query.metricSelector);
  const modelText = [
    str(model.type),
    str(model.alertCondition),
    model.threshold != null ? str(model.threshold) : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasSamples = model.violatingSamples != null || model.samples != null;
  const samples = hasSamples
    ? `${str(model.violatingSamples)} / ${str(model.samples)}` +
      (model.dealertingSamples != null
        ? ` (dealert ${str(model.dealertingSamples)})`
        : "")
    : "";

  return {
    objectId: o.objectId,
    name: str(value.summary) || str(template.title) || o.summary,
    enabled: o.enabled,
    scope: o.scope,
    eventType: str(template.eventType),
    severity: str(template.davisSeverity) || str(model.type),
    metric,
    aggregation: str(query.aggregation),
    model: modelText,
    samples,
    alertOnMissingData:
      model.alertOnNoData === true || value.alertOnMissingData === true,
    managementZone: str(query.managementZone),
    entityFilter: summarizeEntityFilter(asRecord(query.entityFilter)),
    dimensionFilter: summarizeDimensionFilter(asArray(query.dimensionFilter)),
    description: str(value.description) || str(template.description),
  };
}

/** Extracts a rich, table-friendly view of a Davis anomaly-detector settings object. */
export function toDavisDetectorInfo(o: SettingsObjectLite): DavisDetectorInfo {
  const value = o.value;
  const analyzer = asRecord(value.analyzer);
  const input = asRecord(analyzer.input);
  const execution = asRecord(value.executionSettings);

  const analyzerInput = Object.entries(input)
    .map(([k, v]) => {
      const text = str(v);
      return text ? `${k}=${text}` : "";
    })
    .filter(Boolean)
    .slice(0, 8)
    .join("; ");

  const execText = [
    str(execution.actor) ? `actor ${str(execution.actor)}` : "",
    execution.queryOffset != null ? `offset ${str(execution.queryOffset)}` : "",
    execution.delay != null ? `delay ${str(execution.delay)}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    objectId: o.objectId,
    name: str(value.title) || o.summary,
    enabled: o.enabled,
    scope: o.scope,
    analyzer: str(analyzer.name),
    analyzerInput,
    execution: execText,
    description: str(value.description),
  };
}
