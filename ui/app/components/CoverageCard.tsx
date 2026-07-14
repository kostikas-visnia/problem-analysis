import React from "react";
import { Link as RouterLink } from "react-router-dom";
import Borders from "@dynatrace/strato-design-tokens/borders";
import BoxShadows from "@dynatrace/strato-design-tokens/box-shadows";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import type { CategorySummary } from "../types";

type CoverageCardProps = {
  summary: CategorySummary;
};

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export const CoverageCard = ({ summary }: CoverageCardProps) => {
  const explicitPct = percent(summary.explicitCovered, summary.total);
  const effectivePct = percent(summary.effectiveCovered, summary.total);

  return (
    <RouterLink
      to={`/entities/${summary.key}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Flex
        flexDirection="column"
        gap={12}
        padding={20}
        style={{
          width: "280px",
          border: `${Colors.Border.Neutral.Default}`,
          borderRadius: `${Borders.Radius.Container.Default}`,
          background: `${Colors.Background.Surface.Default}`,
          boxShadow: `${BoxShadows.Surface.Raised.Rest}`,
        }}
      >
        <Flex justifyContent="space-between" alignItems="baseline">
          <Heading level={4}>{summary.label}</Heading>
          <Text>{summary.total} total</Text>
        </Flex>

        <Flex flexDirection="column" gap={4}>
          <Flex justifyContent="space-between">
            <Text>Explicit coverage</Text>
            <Text>
              {summary.explicitCovered} / {summary.total} ({explicitPct}%)
            </Text>
          </Flex>
          <ProgressBar
            value={explicitPct}
            max={100}
            color="primary"
            aria-label={`Explicit coverage for ${summary.label}`}
          />
        </Flex>

        <Flex flexDirection="column" gap={4}>
          <Flex justifyContent="space-between">
            <Text>Effective coverage</Text>
            <Text>
              {summary.effectiveCovered} / {summary.total} ({effectivePct}%)
            </Text>
          </Flex>
          <ProgressBar
            value={effectivePct}
            max={100}
            color="success"
            aria-label={`Effective coverage for ${summary.label}`}
          />
        </Flex>

        <Paragraph>
          {summary.hasEnvironmentDefault
            ? "Environment-level anomaly detection is configured."
            : "No environment-level default detected."}
        </Paragraph>
      </Flex>
    </RouterLink>
  );
};
