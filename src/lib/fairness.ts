import type {
  AuditConfig,
  AuditResult,
  DataQualityProfile,
  DataRow,
  GroupComparison,
  GroupStat,
  IntersectionalGroupStat,
  MetricScore,
  Recommendation,
  RecommendationPriority,
  Severity,
  StabilityProfile,
} from "@/lib/types";
import {
  clamp,
  formatPercent,
  formatRatio,
  normalizeToken,
  percentile,
} from "@/lib/utils";
import { calculateFeatureImportance } from "@/lib/xai";

interface MutableGroupStat {
  total: number;
  actualPositive: number;
  predictedPositive: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

interface LowerMetricInput {
  key: string;
  label: string;
  description: string;
  target: string;
  value: number;
  goodUpper: number;
  warningUpper: number;
  weight: number;
  displayValue?: string;
}

interface HigherMetricInput {
  key: string;
  label: string;
  description: string;
  target: string;
  value: number;
  goodLower: number;
  warningLower: number;
  weight: number;
  displayValue?: string;
}

interface BandMetricInput {
  key: string;
  label: string;
  description: string;
  target: string;
  value: number;
  goodMin: number;
  goodMax: number;
  warningMin: number;
  warningMax: number;
  weight: number;
  displayValue?: string;
}

interface AggregateSnapshot {
  demographicParityDifference: number;
  disparateImpactRatio: number;
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  return String(value).trim().length > 0;
}

function toGroupValue(value: unknown): string {
  if (!hasValue(value)) {
    return "Unknown";
  }

  return String(value).trim();
}

function isPositiveValue(value: unknown, positiveLabel: string): boolean {
  return normalizeToken(value) === normalizeToken(positiveLabel);
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stableRowSignature(row: DataRow, columns: string[]): string {
  return columns
    .map((column) => `${column}:${normalizeToken(row[column])}`)
    .join("|");
}

function severityForLower(value: number, goodUpper: number, warningUpper: number): Severity {
  if (value <= goodUpper) {
    return "good";
  }

  if (value <= warningUpper) {
    return "warning";
  }

  return "critical";
}

function severityForHigher(value: number, goodLower: number, warningLower: number): Severity {
  if (value >= goodLower) {
    return "good";
  }

  if (value >= warningLower) {
    return "warning";
  }

  return "critical";
}

function severityForBand(
  value: number,
  goodMin: number,
  goodMax: number,
  warningMin: number,
  warningMax: number
): Severity {
  if (value >= goodMin && value <= goodMax) {
    return "good";
  }

  if (value >= warningMin && value <= warningMax) {
    return "warning";
  }

  return "critical";
}

function riskForLower(value: number, goodUpper: number, warningUpper: number): number {
  if (value <= goodUpper) {
    return 0;
  }

  const scale = warningUpper - goodUpper;
  if (scale <= 0) {
    return 1;
  }

  return clamp((value - goodUpper) / scale, 0, 1);
}

function riskForHigher(value: number, goodLower: number, warningLower: number): number {
  if (value >= goodLower) {
    return 0;
  }

  const scale = goodLower - warningLower;
  if (scale <= 0) {
    return 1;
  }

  return clamp((goodLower - value) / scale, 0, 1);
}

function riskForBand(value: number, warningMin: number, warningMax: number): number {
  if (value >= warningMin && value <= warningMax) {
    return 0;
  }

  if (value < warningMin) {
    return clamp((warningMin - value) / Math.max(warningMin, 0.01), 0, 1);
  }

  return clamp((value - warningMax) / Math.max(2 - warningMax, 0.01), 0, 1);
}

function maxMinDiff(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function createLowerMetric(input: LowerMetricInput): MetricScore {
  return {
    key: input.key,
    label: input.label,
    description: input.description,
    target: input.target,
    value: input.value,
    displayValue: input.displayValue ?? formatPercent(input.value),
    severity: severityForLower(input.value, input.goodUpper, input.warningUpper),
    riskContribution: riskForLower(input.value, input.goodUpper, input.warningUpper),
    weight: input.weight,
  };
}

function createHigherMetric(input: HigherMetricInput): MetricScore {
  return {
    key: input.key,
    label: input.label,
    description: input.description,
    target: input.target,
    value: input.value,
    displayValue: input.displayValue ?? formatRatio(input.value),
    severity: severityForHigher(input.value, input.goodLower, input.warningLower),
    riskContribution: riskForHigher(input.value, input.goodLower, input.warningLower),
    weight: input.weight,
  };
}

function createBandMetric(input: BandMetricInput): MetricScore {
  return {
    key: input.key,
    label: input.label,
    description: input.description,
    target: input.target,
    value: input.value,
    displayValue: input.displayValue ?? formatRatio(input.value),
    severity: severityForBand(
      input.value,
      input.goodMin,
      input.goodMax,
      input.warningMin,
      input.warningMax
    ),
    riskContribution: riskForBand(input.value, input.warningMin, input.warningMax),
    weight: input.weight,
  };
}

function chooseReferenceGroup(groupStats: GroupStat[], preferredReference?: string): string {
  if (preferredReference) {
    const match = groupStats.find(
      (group) => normalizeToken(group.group) === normalizeToken(preferredReference)
    );

    if (match) {
      return match.group;
    }
  }

  return groupStats[0]?.group ?? "Unknown";
}

function buildMetrics(groupStats: GroupStat[], hasPredictions: boolean): MetricScore[] {
  const selectionRates = groupStats.map((group) => group.selectionRate);
  const tprRates = groupStats
    .map((group) => group.tpr)
    .filter((value): value is number => value !== null);
  const fprRates = groupStats
    .map((group) => group.fpr)
    .filter((value): value is number => value !== null);
  const precisionRates = groupStats
    .map((group) => group.precision)
    .filter((value): value is number => value !== null);

  const minSelectionRate = Math.min(...selectionRates);
  const maxSelectionRate = Math.max(...selectionRates);
  const demographicParityDiff = maxSelectionRate - minSelectionRate;
  const disparateImpact = maxSelectionRate === 0 ? 1 : minSelectionRate / maxSelectionRate;

  const counts = groupStats.map((group) => group.total);
  const representationRatio = Math.min(...counts) / Math.max(...counts);
  const selectionRateSpread = standardDeviation(selectionRates);

  const metrics: MetricScore[] = [
    createLowerMetric({
      key: "demographic_parity_diff",
      label: "Demographic Parity Difference",
      description: "Gap between highest and lowest selection rates across groups.",
      target: "<= 10%",
      value: demographicParityDiff,
      goodUpper: 0.1,
      warningUpper: 0.2,
      weight: 0.2,
    }),
    createBandMetric({
      key: "disparate_impact_ratio",
      label: "Disparate Impact Ratio",
      description: "The 80% rule ratio (min selection rate divided by max selection rate).",
      target: "0.80 - 1.25",
      value: disparateImpact,
      goodMin: 0.8,
      goodMax: 1.25,
      warningMin: 0.65,
      warningMax: 1.35,
      weight: 0.16,
      displayValue: formatRatio(disparateImpact),
    }),
    createHigherMetric({
      key: "representation_balance",
      label: "Representation Balance",
      description: "Smallest-to-largest group size ratio in the dataset.",
      target: ">= 0.75",
      value: representationRatio,
      goodLower: 0.75,
      warningLower: 0.55,
      weight: 0.12,
      displayValue: formatRatio(representationRatio),
    }),
    createLowerMetric({
      key: "selection_rate_std_dev",
      label: "Selection Rate Dispersion",
      description: "Standard deviation of group-level selection rates.",
      target: "<= 5%",
      value: selectionRateSpread,
      goodUpper: 0.05,
      warningUpper: 0.1,
      weight: 0.12,
    }),
  ];

  if (hasPredictions && tprRates.length >= 2) {
    metrics.push(
      createLowerMetric({
        key: "equal_opportunity_diff",
        label: "Equal Opportunity Difference",
        description: "Spread of true-positive rates (TPR) across groups.",
        target: "<= 10%",
        value: maxMinDiff(tprRates),
        goodUpper: 0.1,
        warningUpper: 0.2,
        weight: 0.14,
      })
    );
  }

  if (hasPredictions && fprRates.length >= 2) {
    metrics.push(
      createLowerMetric({
        key: "false_positive_rate_diff",
        label: "False Positive Rate Difference",
        description: "Spread of false-positive rates (FPR) across groups.",
        target: "<= 10%",
        value: maxMinDiff(fprRates),
        goodUpper: 0.1,
        warningUpper: 0.2,
        weight: 0.12,
      })
    );
  }

  if (hasPredictions && precisionRates.length >= 2) {
    metrics.push(
      createLowerMetric({
        key: "predictive_parity_diff",
        label: "Predictive Parity Difference",
        description: "Spread of precision across groups.",
        target: "<= 10%",
        value: maxMinDiff(precisionRates),
        goodUpper: 0.1,
        warningUpper: 0.2,
        weight: 0.1,
      })
    );
  }

  if (hasPredictions && tprRates.length >= 2 && fprRates.length >= 2) {
    const equalizedOddsDiff = (maxMinDiff(tprRates) + maxMinDiff(fprRates)) / 2;

    metrics.push(
      createLowerMetric({
        key: "equalized_odds_diff",
        label: "Equalized Odds Difference",
        description: "Combined spread of true-positive and false-positive rates.",
        target: "<= 10%",
        value: equalizedOddsDiff,
        goodUpper: 0.1,
        warningUpper: 0.2,
        weight: 0.14,
      })
    );
  }

  return metrics;
}

function buildGroupComparisons(groupStats: GroupStat[], referenceGroup: string): GroupComparison[] {
  const reference =
    groupStats.find(
      (group) => normalizeToken(group.group) === normalizeToken(referenceGroup)
    ) ?? groupStats[0];

  return groupStats
    .map((group) => {
      const selectionRateGap = Math.abs(group.selectionRate - reference.selectionRate);
      const representationGap = Math.abs(group.populationShare - reference.populationShare);
      const tprGap =
        group.tpr === null || reference.tpr === null
          ? null
          : Math.abs(group.tpr - reference.tpr);
      const fprGap =
        group.fpr === null || reference.fpr === null
          ? null
          : Math.abs(group.fpr - reference.fpr);
      const precisionGap =
        group.precision === null || reference.precision === null
          ? null
          : Math.abs(group.precision - reference.precision);

      const gaps: number[] = [selectionRateGap, representationGap];

      if (tprGap !== null) {
        gaps.push(tprGap);
      }

      if (fprGap !== null) {
        gaps.push(fprGap);
      }

      if (precisionGap !== null) {
        gaps.push(precisionGap);
      }

      const overallGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

      return {
        group: group.group,
        selectionRateGap,
        representationGap,
        tprGap,
        fprGap,
        precisionGap,
        overallGap,
        severity: severityForLower(overallGap, 0.08, 0.16),
      };
    })
    .sort((left, right) => right.overallGap - left.overallGap);
}

function buildIntersectionalStats(
  rows: DataRow[],
  config: AuditConfig,
  hasPredictions: boolean
): IntersectionalGroupStat[] {
  const intersectionKey = config.intersectionAttribute;

  if (!intersectionKey || intersectionKey === config.protectedAttribute) {
    return [];
  }

  const intersectionMap = new Map<
    string,
    { total: number; selected: number; actualPositive: number }
  >();

  for (const row of rows) {
    const protectedValue = toGroupValue(row[config.protectedAttribute]);
    const secondaryValue = toGroupValue(row[intersectionKey]);
    const key = `${protectedValue} x ${secondaryValue}`;

    const actualPositive = isPositiveValue(
      row[config.outcomeAttribute],
      config.favorableOutcome
    );
    const predictedPositive = hasPredictions
      ? isPositiveValue(row[config.predictionAttribute!], config.favorablePrediction!)
      : actualPositive;

    const current = intersectionMap.get(key) ?? {
      total: 0,
      selected: 0,
      actualPositive: 0,
    };

    current.total += 1;

    if (predictedPositive) {
      current.selected += 1;
    }

    if (actualPositive) {
      current.actualPositive += 1;
    }

    intersectionMap.set(key, current);
  }

  const overallSelectionRate = safeDivide(
    Array.from(intersectionMap.values()).reduce((sum, item) => sum + item.selected, 0),
    Math.max(rows.length, 1)
  );

  return Array.from(intersectionMap.entries())
    .map(([intersection, stat]) => {
      const selectionRate = safeDivide(stat.selected, stat.total);
      const overallGap = Math.abs(selectionRate - overallSelectionRate);

      return {
        intersection,
        total: stat.total,
        selectionRate,
        actualPositiveRate: safeDivide(stat.actualPositive, stat.total),
        severity: severityForLower(overallGap, 0.08, 0.16),
      };
    })
    .sort((left, right) => right.total - left.total)
    .slice(0, 12);
}

function toPriorityScore(priority: RecommendationPriority): number {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}

function pushRecommendation(
  recommendations: Recommendation[],
  recommendation: Omit<Recommendation, "id">
): void {
  recommendations.push({
    id: `rec_${recommendations.length + 1}`,
    ...recommendation,
  });
}

function buildRecommendations(
  metrics: MetricScore[],
  groupStats: GroupStat[],
  rowCount: number,
  hasPredictions: boolean,
  dataQuality: DataQualityProfile,
  stability: StabilityProfile,
  minGroupSize: number
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const metricByKey = new Map(metrics.map((metric) => [metric.key, metric]));

  const demographicParity = metricByKey.get("demographic_parity_diff");
  if (demographicParity && demographicParity.severity !== "good") {
    pushRecommendation(recommendations, {
      title: "Rebalance decision thresholds",
      detail:
        "Selection rates are diverging heavily between groups. Threshold tuning or post-processing constraints can reduce this drift.",
      suggestedFix:
        "Run threshold search with fairness constraints and compare quality trade-offs before deployment.",
      priority: demographicParity.severity === "critical" ? "high" : "medium",
    });
  }

  const equalizedOdds = metricByKey.get("equalized_odds_diff");
  if (equalizedOdds && equalizedOdds.severity !== "good") {
    pushRecommendation(recommendations, {
      title: "Harmonize group error rates",
      detail:
        "Equalized odds drift indicates inconsistent error behavior between groups.",
      suggestedFix:
        "Use calibrated probability thresholds and review group-level confusion matrices.",
      priority: equalizedOdds.severity === "critical" ? "high" : "medium",
    });
  }

  const representation = metricByKey.get("representation_balance");
  if (representation && representation.severity !== "good") {
    pushRecommendation(recommendations, {
      title: "Improve dataset representativeness",
      detail:
        "Protected-group sample sizes are imbalanced, making model behavior less reliable for underrepresented populations.",
      suggestedFix:
        "Collect additional records for smaller groups and apply stratified sampling during training.",
      priority: representation.severity === "critical" ? "high" : "medium",
    });
  }

  const smallestGroup = [...groupStats].sort((left, right) => left.total - right.total)[0];
  if (smallestGroup && smallestGroup.total < minGroupSize) {
    pushRecommendation(recommendations, {
      title: "Increase minimum group sample size",
      detail:
        `${smallestGroup.group} has only ${smallestGroup.total} records, below the stability threshold of ${minGroupSize}.`,
      suggestedFix:
        "Set minimum per-group data requirements before approving deployment.",
      priority: "high",
    });
  }

  if (dataQuality.missingValueRate > 0.08 || dataQuality.duplicateRowRate > 0.05) {
    pushRecommendation(recommendations, {
      title: "Strengthen data quality controls",
      detail:
        "Missing or duplicate records can distort fairness metrics and hide real risk.",
      suggestedFix:
        "Add ingestion checks for missing outcomes/protected attributes and deduplicate by unique identifier.",
      priority: "high",
    });
  }

  const ciWidth =
    stability.demographicParityDifferenceCI.high -
    stability.demographicParityDifferenceCI.low;
  if (ciWidth > 0.1) {
    pushRecommendation(recommendations, {
      title: "Reduce fairness uncertainty",
      detail:
        "Wide confidence intervals suggest the fairness estimate is sensitive to sampling variation.",
      suggestedFix:
        "Collect more observations from smaller groups and repeat the audit before high-impact launch.",
      priority: "medium",
    });
  }

  if (!hasPredictions) {
    pushRecommendation(recommendations, {
      title: "Add model prediction logs",
      detail:
        "Prediction labels were not provided, so error-rate fairness metrics could not be computed.",
      suggestedFix:
        "Include model output columns to unlock equal opportunity and false-positive analysis.",
      priority: "medium",
    });
  }

  if (rowCount < 120) {
    pushRecommendation(recommendations, {
      title: "Expand audit sample coverage",
      detail:
        "Small samples increase volatility and may understate minority harm cases.",
      suggestedFix:
        "Aggregate multiple data batches and re-run fairness checks on at least 120 records.",
      priority: "medium",
    });
  }

  if (recommendations.length === 0) {
    pushRecommendation(recommendations, {
      title: "Maintain continuous fairness monitoring",
      detail: "Current signals look stable, but fairness can drift over time as data changes.",
      suggestedFix:
        "Schedule automated weekly audits and set alert thresholds for parity and error gaps.",
      priority: "low",
    });
  }

  return recommendations.sort(
    (left, right) => toPriorityScore(right.priority) - toPriorityScore(left.priority)
  );
}

function buildAnalysisNotes(
  metrics: MetricScore[],
  rowCount: number,
  hasPredictions: boolean,
  groupCount: number,
  dataQuality: DataQualityProfile,
  stability: StabilityProfile
): string[] {
  const criticalCount = metrics.filter((metric) => metric.severity === "critical").length;
  const warningCount = metrics.filter((metric) => metric.severity === "warning").length;

  const notes: string[] = [
    `${rowCount} records analyzed across ${groupCount} protected groups.`,
    `${criticalCount} critical and ${warningCount} warning fairness indicators detected.`,
    `Bootstrap CI for demographic parity difference: ${formatPercent(
      stability.demographicParityDifferenceCI.low
    )} to ${formatPercent(stability.demographicParityDifferenceCI.high)}.`,
  ];

  if (dataQuality.missingValueRate > 0.08) {
    notes.push(
      `Missing value rate is ${formatPercent(dataQuality.missingValueRate)}, which can skew fairness estimates.`
    );
  }

  if (dataQuality.duplicateRowCount > 0) {
    notes.push(`${dataQuality.duplicateRowCount} duplicate rows were detected in the analyzed sample.`);
  }

  if (rowCount < 120) {
    notes.push(
      "Dataset is relatively small. Consider collecting more samples before making policy decisions."
    );
  }

  if (!hasPredictions) {
    notes.push("Only outcome-level parity checks are available without prediction labels.");
  }

  return notes;
}

function createSnapshotFromRows(rows: DataRow[], config: AuditConfig): AggregateSnapshot {
  const hasPredictions = Boolean(config.predictionAttribute && config.favorablePrediction);
  const byGroup = new Map<string, { total: number; selected: number }>();

  for (const row of rows) {
    const protectedRaw = row[config.protectedAttribute];
    const outcomeRaw = row[config.outcomeAttribute];

    if (!hasValue(protectedRaw) || !hasValue(outcomeRaw)) {
      continue;
    }

    const group = toGroupValue(protectedRaw);
    const actualPositive = isPositiveValue(outcomeRaw, config.favorableOutcome);
    const predictedPositive = hasPredictions
      ? isPositiveValue(row[config.predictionAttribute!], config.favorablePrediction!)
      : actualPositive;

    const current = byGroup.get(group) ?? { total: 0, selected: 0 };
    current.total += 1;

    if (predictedPositive) {
      current.selected += 1;
    }

    byGroup.set(group, current);
  }

  const rates = Array.from(byGroup.values())
    .filter((entry) => entry.total > 0)
    .map((entry) => safeDivide(entry.selected, entry.total));

  if (rates.length <= 1) {
    return {
      demographicParityDifference: 0,
      disparateImpactRatio: 1,
    };
  }

  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);

  return {
    demographicParityDifference: maxRate - minRate,
    disparateImpactRatio: maxRate === 0 ? 1 : minRate / maxRate,
  };
}

function buildStabilityProfile(rows: DataRow[], config: AuditConfig): StabilityProfile {
  const bootstrapSamples = rows.length < 120 ? 80 : 140;

  if (rows.length < 20) {
    const snapshot = createSnapshotFromRows(rows, config);
    return {
      bootstrapSamples: 0,
      demographicParityDifferenceCI: {
        low: snapshot.demographicParityDifference,
        high: snapshot.demographicParityDifference,
      },
      disparateImpactRatioCI: {
        low: snapshot.disparateImpactRatio,
        high: snapshot.disparateImpactRatio,
      },
    };
  }

  const seedSource = `${rows.length}:${config.protectedAttribute}:${config.outcomeAttribute}:${config.predictionAttribute ?? "no_pred"}`;
  const seed = seedSource
    .split("")
    .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 17);
  const random = mulberry32(seed);

  const demographicSamples: number[] = [];
  const impactSamples: number[] = [];

  for (let index = 0; index < bootstrapSamples; index += 1) {
    const resample: DataRow[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const pick = Math.floor(random() * rows.length);
      resample.push(rows[pick]);
    }

    const snapshot = createSnapshotFromRows(resample, config);
    demographicSamples.push(snapshot.demographicParityDifference);
    impactSamples.push(snapshot.disparateImpactRatio);
  }

  return {
    bootstrapSamples,
    demographicParityDifferenceCI: {
      low: percentile(demographicSamples, 0.025),
      high: percentile(demographicSamples, 0.975),
    },
    disparateImpactRatioCI: {
      low: percentile(impactSamples, 0.025),
      high: percentile(impactSamples, 0.975),
    },
  };
}

function buildDataQualityProfile(
  rows: DataRow[],
  columns: string[],
  config: AuditConfig
): DataQualityProfile {
  if (rows.length === 0 || columns.length === 0) {
    return {
      duplicateRowCount: 0,
      duplicateRowRate: 0,
      missingValueRate: 0,
      rowValidityRate: 0,
      sparseColumns: [],
      highCardinalityColumns: [],
    };
  }

  const signatureSet = new Set<string>();
  let duplicateRowCount = 0;
  let missingCellCount = 0;
  let validRowCount = 0;

  const distinctByColumn = new Map<string, Set<string>>();
  const missingByColumn = new Map<string, number>();

  for (const column of columns) {
    distinctByColumn.set(column, new Set<string>());
    missingByColumn.set(column, 0);
  }

  for (const row of rows) {
    const signature = stableRowSignature(row, columns);

    if (signatureSet.has(signature)) {
      duplicateRowCount += 1;
    } else {
      signatureSet.add(signature);
    }

    const protectedPresent = hasValue(row[config.protectedAttribute]);
    const outcomePresent = hasValue(row[config.outcomeAttribute]);

    if (protectedPresent && outcomePresent) {
      validRowCount += 1;
    }

    for (const column of columns) {
      const value = row[column];

      if (!hasValue(value)) {
        missingCellCount += 1;
        missingByColumn.set(column, (missingByColumn.get(column) ?? 0) + 1);
        continue;
      }

      distinctByColumn.get(column)?.add(normalizeToken(value));
    }
  }

  const totalCells = rows.length * columns.length;
  const sparseColumns: string[] = [];
  const highCardinalityColumns: string[] = [];

  for (const column of columns) {
    const missingCount = missingByColumn.get(column) ?? 0;
    const missingRate = safeDivide(missingCount, rows.length);
    const distinctCount = distinctByColumn.get(column)?.size ?? 0;
    const cardinalityRate = safeDivide(distinctCount, rows.length);

    if (missingRate >= 0.35) {
      sparseColumns.push(column);
    }

    if (cardinalityRate >= 0.7 && !/id$/i.test(column)) {
      highCardinalityColumns.push(column);
    }
  }

  return {
    duplicateRowCount,
    duplicateRowRate: safeDivide(duplicateRowCount, rows.length),
    missingValueRate: safeDivide(missingCellCount, totalCells),
    rowValidityRate: safeDivide(validRowCount, rows.length),
    sparseColumns: sparseColumns.slice(0, 8),
    highCardinalityColumns: highCardinalityColumns.slice(0, 8),
  };
}

export function runFairnessAudit(rows: DataRow[], config: AuditConfig): AuditResult {
  const minGroupSize = Math.max(5, config.minGroupSize ?? 20);

  if (!config.protectedAttribute || !config.outcomeAttribute || !config.favorableOutcome) {
    throw new Error("Protected attribute, outcome attribute, and favorable outcome are required.");
  }

  const nonEmptyRows = rows.filter((row) => Object.keys(row).length > 0);

  if (nonEmptyRows.length === 0) {
    throw new Error("No rows are available for auditing.");
  }

  const availableColumns = new Set<string>();
  for (const row of nonEmptyRows) {
    for (const column of Object.keys(row)) {
      availableColumns.add(column);
    }
  }

  if (!availableColumns.has(config.protectedAttribute)) {
    throw new Error(`Column '${config.protectedAttribute}' is not present in the dataset.`);
  }

  if (!availableColumns.has(config.outcomeAttribute)) {
    throw new Error(`Column '${config.outcomeAttribute}' is not present in the dataset.`);
  }

  if (config.predictionAttribute && !availableColumns.has(config.predictionAttribute)) {
    throw new Error(`Column '${config.predictionAttribute}' is not present in the dataset.`);
  }

  if (config.intersectionAttribute && !availableColumns.has(config.intersectionAttribute)) {
    throw new Error(`Column '${config.intersectionAttribute}' is not present in the dataset.`);
  }

  if (config.predictionAttribute && !config.favorablePrediction) {
    throw new Error("Favorable prediction value is required when prediction column is provided.");
  }

  const sanitizedRows = nonEmptyRows.filter(
    (row) => hasValue(row[config.protectedAttribute]) && hasValue(row[config.outcomeAttribute])
  );

  if (sanitizedRows.length === 0) {
    throw new Error("No valid rows were found after filtering missing protected/outcome values.");
  }

  const hasPredictions = Boolean(config.predictionAttribute && config.favorablePrediction);

  const groups = new Map<string, MutableGroupStat>();

  for (const row of sanitizedRows) {
    const groupValue = toGroupValue(row[config.protectedAttribute]);
    const actualPositive = isPositiveValue(row[config.outcomeAttribute], config.favorableOutcome);
    const predictedPositive = hasPredictions
      ? isPositiveValue(row[config.predictionAttribute!], config.favorablePrediction!)
      : actualPositive;

    const current = groups.get(groupValue) ?? {
      total: 0,
      actualPositive: 0,
      predictedPositive: 0,
      truePositive: 0,
      falsePositive: 0,
      trueNegative: 0,
      falseNegative: 0,
    };

    current.total += 1;

    if (actualPositive) {
      current.actualPositive += 1;
    }

    if (predictedPositive) {
      current.predictedPositive += 1;
    }

    if (hasPredictions) {
      if (predictedPositive && actualPositive) {
        current.truePositive += 1;
      } else if (predictedPositive && !actualPositive) {
        current.falsePositive += 1;
      } else if (!predictedPositive && !actualPositive) {
        current.trueNegative += 1;
      } else {
        current.falseNegative += 1;
      }
    }

    groups.set(groupValue, current);
  }

  if (groups.size < 2) {
    throw new Error(
      "At least two groups are required in the protected attribute column for fairness analysis."
    );
  }

  const rowCount = sanitizedRows.length;

  const groupStats = Array.from(groups.entries())
    .map(([group, stat]): GroupStat => {
      const tprDenominator = stat.truePositive + stat.falseNegative;
      const fprDenominator = stat.falsePositive + stat.trueNegative;
      const precisionDenominator = stat.truePositive + stat.falsePositive;

      return {
        group,
        total: stat.total,
        populationShare: safeDivide(stat.total, rowCount),
        actualPositive: stat.actualPositive,
        predictedPositive: stat.predictedPositive,
        actualPositiveRate: safeDivide(stat.actualPositive, stat.total),
        selectionRate: safeDivide(stat.predictedPositive, stat.total),
        tpr: hasPredictions ? safeDivide(stat.truePositive, tprDenominator) : null,
        fpr: hasPredictions ? safeDivide(stat.falsePositive, fprDenominator) : null,
        precision: hasPredictions ? safeDivide(stat.truePositive, precisionDenominator) : null,
      };
    })
    .sort((left, right) => right.total - left.total);

  const stability = buildStabilityProfile(sanitizedRows, config);
  const dataQuality = buildDataQualityProfile(
    nonEmptyRows,
    Array.from(availableColumns.values()),
    config
  );

  const metrics = buildMetrics(groupStats, hasPredictions).map((metric) => {
    if (metric.key === "demographic_parity_diff") {
      return {
        ...metric,
        confidenceInterval: {
          low: stability.demographicParityDifferenceCI.low,
          high: stability.demographicParityDifferenceCI.high,
          display: `${formatPercent(stability.demographicParityDifferenceCI.low)} - ${formatPercent(
            stability.demographicParityDifferenceCI.high
          )}`,
        },
      };
    }

    if (metric.key === "disparate_impact_ratio") {
      return {
        ...metric,
        confidenceInterval: {
          low: stability.disparateImpactRatioCI.low,
          high: stability.disparateImpactRatioCI.high,
          display: `${formatRatio(stability.disparateImpactRatioCI.low)} - ${formatRatio(
            stability.disparateImpactRatioCI.high
          )}`,
        },
      };
    }

    return metric;
  });

  const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);
  const weightedRisk = metrics.reduce(
    (sum, metric) => sum + metric.riskContribution * metric.weight,
    0
  );

  const overallRiskScore = Math.round(
    safeDivide(weightedRisk, Math.max(totalWeight, 0.0001)) * 100
  );
  const fairnessIndex = clamp(100 - overallRiskScore, 0, 100);

  const referenceGroup = chooseReferenceGroup(groupStats, config.referenceGroup);
  const groupComparisons = buildGroupComparisons(groupStats, referenceGroup);
  const intersectionalStats = buildIntersectionalStats(sanitizedRows, config, hasPredictions);
  const recommendations = buildRecommendations(
    metrics,
    groupStats,
    rowCount,
    hasPredictions,
    dataQuality,
    stability,
    minGroupSize
  );

  const biasFlags = metrics
    .filter((metric) => metric.severity !== "good")
    .map((metric) => `${metric.label}: ${metric.displayValue} (${metric.severity})`);

  const analysisNotes = buildAnalysisNotes(
    metrics,
    rowCount,
    hasPredictions,
    groupStats.length,
    dataQuality,
    stability
  );

  const criticalCount = metrics.filter((metric) => metric.severity === "critical").length;
  const warningCount = metrics.filter((metric) => metric.severity === "warning").length;

  const quickSummary =
    overallRiskScore >= 70
      ? `High fairness risk (${overallRiskScore}/100) with ${criticalCount} critical indicators.`
      : overallRiskScore >= 40
      ? `Moderate fairness risk (${overallRiskScore}/100) with ${warningCount} warning indicators.`
      : `Low fairness risk (${overallRiskScore}/100). Continue monitoring for drift.`;

  return {
    profile: {
      rowCount,
      columnCount: availableColumns.size,
      groupsAnalyzed: groupStats.length,
      hasPredictions,
      generatedAt: new Date().toISOString(),
    },
    dataQuality,
    stability,
    referenceGroup,
    overallRiskScore,
    metrics,
    groupStats,
    groupComparisons,
    intersectionalStats,
    recommendations,
    biasFlags,
    analysisNotes,
    quickSummary,
    featureImportance: calculateFeatureImportance(sanitizedRows, config),
    fairnessIndex,
  };
}