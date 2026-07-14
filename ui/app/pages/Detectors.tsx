import React, { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Text,
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
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import type {
  DavisDetectorInfo,
  DetectorsResponse,
  MetricEventInfo,
} from "../types";

function StatusChip({ enabled }: { enabled: boolean }) {
  return (
    <Chip color={enabled ? "success" : "neutral"} size="condensed">
      <Chip.Key>{enabled ? "Enabled" : "Disabled"}</Chip.Key>
    </Chip>
  );
}

function textColumn<T>(
  id: keyof T & string,
  header: string,
  minWidth = 160,
): DataTableColumnDef<T> {
  return {
    id,
    header,
    accessor: id,
    minWidth,
    cell: ({ rowData }: { rowData: T }) => {
      const value = rowData[id];
      const text = value === undefined || value === null || value === "" ? "—" : String(value);
      return <Text>{text}</Text>;
    },
  };
}

export const Detectors = () => {
  const { data, error, isLoading } = useAppFunction<DetectorsResponse>({
    name: "get-detectors",
  });

  const metricColumns = useMemo<DataTableColumnDef<MetricEventInfo>[]>(
    () => [
      { id: "name", header: "Name", accessor: "name", minWidth: 240 },
      {
        id: "enabled",
        header: "Status",
        accessor: (row: MetricEventInfo) => (row.enabled ? "enabled" : "disabled"),
        cell: ({ rowData }: { rowData: MetricEventInfo }) => (
          <StatusChip enabled={rowData.enabled} />
        ),
        minWidth: 110,
      },
      textColumn<MetricEventInfo>("eventType", "Event type", 150),
      textColumn<MetricEventInfo>("metric", "Metric", 240),
      textColumn<MetricEventInfo>("aggregation", "Aggregation", 130),
      textColumn<MetricEventInfo>("model", "Condition", 220),
      textColumn<MetricEventInfo>("samples", "Samples (viol./total)", 160),
      {
        id: "alertOnMissingData",
        header: "Alert on missing data",
        accessor: (row: MetricEventInfo) => (row.alertOnMissingData ? "yes" : "no"),
        cell: ({ rowData }: { rowData: MetricEventInfo }) => (
          <Text>{rowData.alertOnMissingData ? "Yes" : "No"}</Text>
        ),
        minWidth: 160,
      },
      textColumn<MetricEventInfo>("entityFilter", "Entity filter", 240),
      textColumn<MetricEventInfo>("dimensionFilter", "Dimension filter", 220),
      textColumn<MetricEventInfo>("managementZone", "Management zone", 170),
      textColumn<MetricEventInfo>("scope", "Scope", 150),
      textColumn<MetricEventInfo>("description", "Description", 280),
    ],
    [],
  );

  const davisColumns = useMemo<DataTableColumnDef<DavisDetectorInfo>[]>(
    () => [
      { id: "name", header: "Name", accessor: "name", minWidth: 240 },
      {
        id: "enabled",
        header: "Status",
        accessor: (row: DavisDetectorInfo) => (row.enabled ? "enabled" : "disabled"),
        cell: ({ rowData }: { rowData: DavisDetectorInfo }) => (
          <StatusChip enabled={rowData.enabled} />
        ),
        minWidth: 110,
      },
      textColumn<DavisDetectorInfo>("analyzer", "Analyzer", 240),
      textColumn<DavisDetectorInfo>("analyzerInput", "Configuration", 320),
      textColumn<DavisDetectorInfo>("execution", "Execution", 200),
      textColumn<DavisDetectorInfo>("scope", "Scope", 150),
      textColumn<DavisDetectorInfo>("description", "Description", 280),
    ],
    [],
  );

  return (
    <Flex flexDirection="column" gap={20} padding={32}>
      <Flex flexDirection="column" gap={8}>
        <RouterLink to="/" style={{ width: "fit-content" }}>
          ← Back to overview
        </RouterLink>
        <Heading>Metric events &amp; Davis anomaly detectors</Heading>
        <Paragraph>
          Environment-wide anomaly-detection configurations. Metric events raise
          custom alerts from metric thresholds/baselines; Davis anomaly detectors
          run Davis analyzers on a defined scope.
        </Paragraph>
      </Flex>

      {isLoading && (
        <Flex alignItems="center" gap={12}>
          <ProgressCircle aria-label="Loading detectors" />
          <Paragraph>Loading metric events and Davis detectors…</Paragraph>
        </Flex>
      )}

      {error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>Could not load detectors</MessageContainer.Title>
          {error.message}
        </MessageContainer>
      )}

      {data && data.diagnostics.length > 0 && (
        <MessageContainer variant="warning">
          <MessageContainer.Title>Some data could not be loaded</MessageContainer.Title>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {data.diagnostics.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </MessageContainer>
      )}

      {data && (
        <Flex flexDirection="column" gap={8}>
          <Heading level={4}>Metric events ({data.metricEvents.length})</Heading>
          <DataTable
            data={data.metricEvents}
            columns={metricColumns}
            sortable
            resizable
          >
            <DataTable.Pagination />
            <DataTable.EmptyState>
              No metric events found in this environment.
            </DataTable.EmptyState>
          </DataTable>
        </Flex>
      )}

      {data && (
        <Flex flexDirection="column" gap={8}>
          <Heading level={4}>
            Davis anomaly detectors ({data.davisDetectors.length})
          </Heading>
          <DataTable
            data={data.davisDetectors}
            columns={davisColumns}
            sortable
            resizable
          >
            <DataTable.Pagination />
            <DataTable.EmptyState>
              No Davis anomaly detectors found in this environment.
            </DataTable.EmptyState>
          </DataTable>
        </Flex>
      )}
    </Flex>
  );
};
