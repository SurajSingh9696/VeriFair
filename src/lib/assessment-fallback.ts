import type { AiAssessment, AuditConfig, AuditResult } from "@/lib/types";

interface FallbackInput {
  report: AuditResult;
  config: AuditConfig;
  datasetName?: string;
  reason?: string;
}

function computeConfidence(report: AuditResult): "low" | "medium" | "high" {
  const ciWidth =
    report.stability.demographicParityDifferenceCI.high -
    report.stability.demographicParityDifferenceCI.low;

  if (report.profile.rowCount < 120 || ciWidth > 0.12) {
    return "low";
  }

  if (report.profile.rowCount < 320 || ciWidth > 0.08) {
    return "medium";
  }

  return "high";
}

export function buildMlFallbackAssessment(input: FallbackInput): AiAssessment {
  const { report, datasetName, reason } = input;
  const topMetric = [...report.metrics].sort(
    (left, right) => right.riskContribution - left.riskContribution
  )[0];

  const criticalMetrics = report.metrics
    .filter((metric) => metric.severity === "critical")
    .slice(0, 3)
    .map((metric) => `${metric.label}: ${metric.displayValue}`);

  const gapInsights = report.groupComparisons
    .filter((group) => group.severity !== "good")
    .slice(0, 2)
    .map(
      (group) =>
        `${group.group} gap ${Math.round(group.overallGap * 100)}% vs ${report.referenceGroup}`
    );

  const flaggedPatterns = [...criticalMetrics, ...gapInsights];

  const suggestedActions = report.recommendations
    .slice(0, 4)
    .map((item) => `${item.title}: ${item.suggestedFix}`);

  const summaryParts = [
    `${report.quickSummary}`,
    topMetric
      ? `Primary risk driver is ${topMetric.label} (${topMetric.displayValue}).`
      : "Primary risk driver was not identified.",
    datasetName ? `Dataset: ${datasetName}.` : "",
  ].filter((part) => part.length > 0);

  return {
    model: "ml-fallback",
    generatedAt: new Date().toISOString(),
    confidence: computeConfidence(report),
    summary: summaryParts.join(" "),
    flaggedPatterns:
      flaggedPatterns.length > 0
        ? flaggedPatterns
        : ["No additional high-severity pattern extracted in fallback mode."],
    suggestedActions:
      suggestedActions.length > 0
        ? suggestedActions
        : [
            "Review protected-group distributions and rerun the audit after expanding low-volume groups.",
          ],
    rawText: reason ? `Fallback activated: ${reason}` : "Fallback activated.",
  };
}
