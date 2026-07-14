import React, { useMemo } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
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

export const EntityDetails = () => {
  const { type } = useParams<{ type: string }>();

  const { data, error, isLoading } = useAppFunction<EntityDetailsResponse>({
    name: "get-entity-details",
    data: { type },
  });

  const columns = useMemo<DataTableColumnDef<EntityDetailRow>[]>(
    () => [
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
            ? "explicit"
            : row.isEffectivelyCovered
              ? "inherited"
              : "none",
        cell: ({ rowData }: { rowData: EntityDetailRow }) => {
          if (rowData.isExplicitlyCovered) {
            return (
              <Chip color="success" size="condensed">
                <Chip.Key>Explicit</Chip.Key>
              </Chip>
            );
          }
          if (rowData.isEffectivelyCovered) {
            return (
              <Chip color="primary" size="condensed">
                <Chip.Key>Inherited</Chip.Key>
              </Chip>
            );
          }
          return (
            <Chip color="critical" size="condensed">
              <Chip.Key>None</Chip.Key>
            </Chip>
          );
        },
      },
      {
        id: "explicit",
        header: "Entity-scoped",
        accessor: (row: EntityDetailRow) => row.explicit.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.explicit} />
        ),
        minWidth: 200,
      },
      {
        id: "hostGroup",
        header: "Host-group inherited",
        accessor: (row: EntityDetailRow) => row.inheritedHostGroup.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.inheritedHostGroup} />
        ),
        minWidth: 200,
      },
      {
        id: "environment",
        header: "Environment inherited",
        accessor: (row: EntityDetailRow) => row.inheritedEnvironment.length,
        cell: ({ rowData }: { rowData: EntityDetailRow }) => (
          <SettingsCell items={rowData.inheritedEnvironment} />
        ),
        minWidth: 200,
      },
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
    ],
    [],
  );

  return (
    <Flex flexDirection="column" gap={20} padding={32}>
      <Flex flexDirection="column" gap={8}>
        <RouterLink to="/" style={{ width: "fit-content" }}>
          ← Back to overview
        </RouterLink>
        <Heading>{data ? data.label : "Entity"} anomaly detection</Heading>
        {data && (
          <Paragraph>
            <Strong>{data.total}</Strong> entities. Each row shows the anomaly
            detection objects that apply, split by how they are attached.
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
          <MessageContainer.Title>
            Some data could not be loaded
          </MessageContainer.Title>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {data.diagnostics.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </MessageContainer>
      )}

      {data && (
        <DataTable data={data.rows} columns={columns} sortable resizable>
          <DataTable.Pagination />
        </DataTable>
      )}

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
    </Flex>
  );
};
