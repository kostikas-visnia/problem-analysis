import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
} from "@dynatrace/strato-components/typography";
import { ProgressCircle, MessageContainer } from "@dynatrace/strato-components/content";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import { CoverageCard } from "../components/CoverageCard";
import type { CoverageSummaryResponse } from "../types";

export const Home = () => {
  const { data, error, isLoading } = useAppFunction<CoverageSummaryResponse>({
    name: "get-coverage-summary",
  });

  return (
    <Flex flexDirection="column" gap={24} padding={32}>
      <Flex flexDirection="column" gap={8}>
        <Heading>Anomaly detection coverage</Heading>
        <Paragraph>
          For each entity category, see how many entities exist and how many have
          anomaly detection attached. <Strong>Explicit</Strong> coverage counts
          entity- or host-group-scoped settings and matched metric events / Davis
          detectors. <Strong>Effective</Strong> coverage additionally includes
          environment-level defaults. Select a category to drill down.
        </Paragraph>
      </Flex>

      {isLoading && (
        <Flex alignItems="center" gap={12}>
          <ProgressCircle aria-label="Loading coverage summary" />
          <Paragraph>
            Analyzing entities and anomaly detection settings…
          </Paragraph>
        </Flex>
      )}

      {error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>
            Could not load coverage summary
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
        <Flex gap={24} flexFlow="wrap">
          {data.categories.map((category) => (
            <CoverageCard key={category.key} summary={category} />
          ))}
        </Flex>
      )}
    </Flex>
  );
};
