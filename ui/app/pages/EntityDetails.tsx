import React, { useMemo, useState } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import Borders from "@dynatrace/strato-design-tokens/borders";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Text,
  Strong,
} from "@dynatrace/strato-components/typography";
import {
  Chip,
  ProgressCircle,
  MessageContainer,
} from "@dynatrace/strato-components/content";
import {
  DataTable,
  type DataTableColumnDef,
} from "@dynatrace/strato-components/tables";
import { Select } from "@dynatrace/strato-components/forms";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import type {
  EntityDetailRow,
  EntityDetailsResponse,
  SettingRef,
} from "../types";

function SettingsCell({ items }: { items: SettingRef[] }) {
  if (items.length === 0) {
    return <Text>—</Text>;
  }
  return (
    <Flex flexFlow="wrap" gap={4}>
      {items.map((item) => (
        <Chip
          key={item.objectId}
          color={item.enabled ? "neutral" : "warning"}
          size="condensed"
        >
          <Chip.Key>{item.summary || item.schemaId}</Chip.Key>
        </Chip>
      ))}
    </Flex>
  );
}

type CoverageFilter = "all" | "direct" | "env-default" | "none";

const FILTER_OPTIONS: { value: CoverageFilter; label: string }[] = [
  { value: "all", label: "All entities" },
  { value: "direct", label: "Direct settings only" },
  { value: "env-default", label: "Environment default only" },
  { value: "none", label: "No coverage" },
];

export const EntityDetails = () => {
  const { type } = useParams<{ type: string }>();
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");

  const { data, error, isLoading } = useAppFunction<EntityDetailsResponse>({
    name: "get-entity-details",
    data: { type },
  });

  const isHostType = data?.type === "host";

  // Environment settings are identical across all rows — grab from the first row.
  const environmentSettings: SettingRef[] =
    data?.rows[0]?.inheritedEnvironment ?? [];

  const counts = useMemo(() => {
    if (!data) return null;
    const direct = data.rows.filter((r) => r.isExplicitlyCovered).length;
    const envDefault = data.rows.filter(
      (r) => r.isEffectivelyCovered && !r.isExplicitlyCovered,
    ).length;
    const none = data.rows.filter((r) => !r.isEffectivelyCovered).length;
    return { direct, envDefault, none };
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    switch (coverageFilter) {
      case "direct":
        return data.rows.filter((r) => r.isExplicitlyCovered);
      case "env-default":
        return data.rows.filter(
          (r) => r.isEffectivelyCovered && !r.isExplicitlyCovered,
        );
      case "none":
        return data.rows.filter((r) => !r.isEffectivelyCovered);
      default:
        return data.rows;
    }
  }, [data, coverageFilter]);

  const columns = useMemo<DataTableColumnDef<EntityDetailRow>[]>(() => {
    const cols: DataTableColumnDef<EntityDetailRow>[] = [
      {
        id: "name",
        header: "Entity",
        accessor: "name",
        minWidth: 220,
      },
      {
        id: "coverage",
        header: "Coverage",
        accessor: (row: EntityDetailRow) =>
          row.isExplicitlyCovered
            ? "direct"
            : row.isEffectivelyCovered
              ? "env-default"
              : "none",
        cell: ({ rowData }: { rowData: EntityDetailRow }) => {
          if (rowData.isExplicitlyCovered) {
            return (
              <Chip color="success" size="condensed">
                <Chip.Key>Direct</Chip.Key>
              </Chip>
            );
          }
          if (rowData.isEffectivelyCovered) {
            return (
              <Chip color="primary" size="condensed">
                <Chip.Key>Env. default</Chip.Key>
              </Chip>
            );
          }
          return (
            <Chip color="critical" size="condensed">
              <Chip.Key>No coverage</Chip.Key>
            </Chip>
          );
        },
      },
      {
        id: "explicit",
        header: "Direct settings",
        accessor: (row: EntityDetailRow) => row.explicit.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.explicit} />
        ),
        minWidth: 200,
      },
    ];

    if (isHostType) {
      cols.push({
        id: "hostGroup",
        header: "Host-group settings",
        accessor: (row: EntityDetailRow) => row.inheritedHostGroup.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.inheritedHostGroup} />
        ),
        minWidth: 200,
      });
    }

    cols.push(
      {
        id: "metricEvents",
        header: "Metric events",
        accessor: (row: EntityDetailRow) => row.metricEvents.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.metricEvents} />
        ),
        minWidth: 180,
      },
      {
        id: "davis",
        header: "Davis detectors",
        accessor: (row: EntityDetailRow) => row.davisDetectors.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.davisDetectors} />
        ),
        minWidth: 180,
      },
    );

    return cols;
  }, [isHostType]);

  return (
    <Flex flexDirection="column" gap={20} padding={32}>
      <Flex flexDirection="column" gap={8}>
        <RouterLink to="/" style={{ width: "fit-content" }}>
          ← Back to overview
        </RouterLink>
        <Heading>{data ? data.label : "Entity"} anomaly detection</Heading>
        {data && counts && (
          <Paragraph>
            <Strong>{data.total}</Strong> entities total —{" "}
            <Strong>{counts.direct}</Strong> with direct settings,{" "}
            <Strong>{counts.envDefault}</Strong> covered by environment default
            only, <Strong>{counts.none}</Strong> with no coverage.
          </Paragraph>
        )}
      </Flex>

      {isLoading && (
        <Flex alignItems="center" gap={12}>
          <ProgressCircle aria-label="Loading entity details" />
          <Paragraph>Resolving anomaly detection settings per entity…</Paragraph>
        </Flex>
      )}

      {error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>
            Could not load entity details
          </MessageContainer.Title>
          {error.message}
        </MessageContainer>
      )}

      {data && data.diagnostics.length > 0 && (
        <MessageContainer variant="warning">
          <MessageContainer.Title>Some data could not be loaded</MessageContainer.Title>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {data.diagnostics.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </MessageContainer>
      )}

      {/* Environment-wide settings — same for every entity; shown once instead of repeated per row */}
      {data && environmentSettings.length > 0 && (
        <Flex
          flexDirection="column"
          gap={8}
          padding={16}
          style={{
            border: `${Colors.Border.Neutral.Default}`,
            borderRadius: `${Borders.Radius.Container.Default}`,
            background: `${Colors.Background.Surface.Default}`,
          }}
        >
          <Text>
            <Strong>Environment-wide settings</Strong> — these{" "}
            {environmentSettings.length} configuration(s) apply to all{" "}
            {data.label.toLowerCase()} by default:
          </Text>
          <Flex flexFlow="wrap" gap={4}>
            {environmentSettings.map((item) => (
              <Chip
                key={item.objectId}
                color={item.enabled ? "neutral" : "warning"}
                size="condensed"
              >
                <Chip.Key>{item.summary || item.schemaId}</Chip.Key>
              </Chip>
            ))}
          </Flex>
        </Flex>
      )}

      {/* Global detectors that could not be attributed to specific entities */}
      {data &&
        (data.globalDetectors.metricEvents.length > 0 ||
          data.globalDetectors.davisDetectors.length > 0) && (
          <Paragraph>
            {data.globalDetectors.metricEvents.length} metric event(s) and{" "}
            {data.globalDetectors.davisDetectors.length} Davis detector(s) apply
            environment-wide (not attributed to a specific entity). See the{" "}
            <RouterLink to="/detectors">Detectors</RouterLink> page for full
            details.
          </Paragraph>
        )}

      {data && (
        <Flex alignItems="center" gap={8}>
          <Text>Show:</Text>
          <Select<CoverageFilter>
            value={coverageFilter}
            onChange={(val) =>
              setCoverageFilter((val as CoverageFilter) ?? "all")
            }
            style={{ width: 280 }}
          >
            <Select.Content>
              {FILTER_OPTIONS.map(({ value, label }) => (
                <Select.Option key={value} value={value}>
                  {label}
                  {counts &&
                    ` (${
                      value === "all"
                        ? data.total
                        : value === "direct"
                          ? counts.direct
                          : value === "env-default"
                            ? counts.envDefault
                            : counts.none
                    })`}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </Flex>
      )}

      {data && (
        <DataTable data={filteredRows} columns={columns} sortable resizable>
          <DataTable.Pagination />
          <DataTable.EmptyState>
            No entities match the selected filter.
          </DataTable.EmptyState>
        </DataTable>
      )}
    </Flex>
  );
};
