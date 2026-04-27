import type { AuditConfig, DataRow } from "@/lib/types";
import { normalizeToken } from "@/lib/utils";

export interface MitigationResult {
  newData: DataRow[];
  logs: string[];
}

interface GroupSummary {
  group: string;
  total: number;
  selected: number;
  selectionRate: number;
}

function toGroupValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  const cleaned = String(value).trim();
  return cleaned.length > 0 ? cleaned : "Unknown";
}

function summarizeGroups(
  rows: DataRow[],
  protectedAttribute: string,
  targetColumn: string,
  favorableValue: string
): GroupSummary[] {
  const byGroup = new Map<string, { total: number; selected: number }>();

  for (const row of rows) {
    const group = toGroupValue(row[protectedAttribute]);
    const isSelected = normalizeToken(row[targetColumn]) === normalizeToken(favorableValue);

    const current = byGroup.get(group) ?? { total: 0, selected: 0 };
    current.total += 1;

    if (isSelected) {
      current.selected += 1;
    }

    byGroup.set(group, current);
  }

  return Array.from(byGroup.entries())
    .map(([group, stat]) => ({
      group,
      total: stat.total,
      selected: stat.selected,
      selectionRate: stat.total === 0 ? 0 : stat.selected / stat.total,
    }))
    .sort((left, right) => right.selectionRate - left.selectionRate);
}

function rebalanceMinoritySamples(
  rows: DataRow[],
  protectedAttribute: string,
  summaries: GroupSummary[]
): { rows: DataRow[]; log?: string } {
  if (summaries.length < 2) {
    return { rows };
  }

  const largest = [...summaries].sort((left, right) => right.total - left.total)[0];
  const smallest = [...summaries].sort((left, right) => left.total - right.total)[0];

  if (!largest || !smallest || smallest.total === 0) {
    return { rows };
  }

  const ratio = largest.total / smallest.total;
  if (ratio <= 2.5) {
    return { rows };
  }

  const needed = Math.round(largest.total * 0.5 - smallest.total);
  if (needed <= 0) {
    return { rows };
  }

  const minorityRows = rows.filter(
    (row) => toGroupValue(row[protectedAttribute]) === smallest.group
  );

  const syntheticRows = Array.from({ length: needed }).map((_, index) => {
    const source = minorityRows[index % minorityRows.length];
    return { ...source, __synthetic_mitigation: true };
  });

  return {
    rows: [...rows, ...syntheticRows],
    log: `Balanced representation by adding ${syntheticRows.length} synthetic records for ${smallest.group}.`,
  };
}

function improveSelectionGap(
  rows: DataRow[],
  config: AuditConfig,
  summaries: GroupSummary[]
): { rows: DataRow[]; changed: number; gapBefore: number; gapAfter: number } {
  if (summaries.length < 2) {
    return { rows, changed: 0, gapBefore: 0, gapAfter: 0 };
  }

  const targetColumn = config.predictionAttribute ?? config.outcomeAttribute;
  const favorableValue = config.favorablePrediction ?? config.favorableOutcome;
  const bestGroup = summaries[0];
  const worstGroup = summaries[summaries.length - 1];

  if (!targetColumn || !favorableValue || !bestGroup || !worstGroup) {
    return { rows, changed: 0, gapBefore: 0, gapAfter: 0 };
  }

  const gapBefore = Math.max(0, bestGroup.selectionRate - worstGroup.selectionRate);
  if (gapBefore <= 0.08) {
    return { rows, changed: 0, gapBefore, gapAfter: gapBefore };
  }

  const targetRate = Math.min(bestGroup.selectionRate * 0.88, bestGroup.selectionRate - 0.04);
  const requiredSelected = Math.ceil(targetRate * worstGroup.total);
  const additionalNeeded = Math.max(0, requiredSelected - worstGroup.selected);

  if (additionalNeeded === 0) {
    return { rows, changed: 0, gapBefore, gapAfter: gapBefore };
  }

  const candidateIndexes: number[] = [];

  rows.forEach((row, index) => {
    const group = toGroupValue(row[config.protectedAttribute]);
    if (group !== worstGroup.group) {
      return;
    }

    const currentIsPositive = normalizeToken(row[targetColumn]) === normalizeToken(favorableValue);
    if (currentIsPositive) {
      return;
    }

    // Prefer rows that are actually favorable when predictions are available.
    const actualIsPositive =
      normalizeToken(row[config.outcomeAttribute]) === normalizeToken(config.favorableOutcome);

    if (config.predictionAttribute) {
      if (actualIsPositive) {
        candidateIndexes.unshift(index);
      } else {
        candidateIndexes.push(index);
      }
    } else {
      candidateIndexes.push(index);
    }
  });

  if (candidateIndexes.length === 0) {
    return { rows, changed: 0, gapBefore, gapAfter: gapBefore };
  }

  const selectedIndexes = candidateIndexes.slice(0, additionalNeeded);
  const selectedIndexSet = new Set(selectedIndexes);

  const updatedRows = rows.map((row, index) => {
    if (!selectedIndexSet.has(index)) {
      return row;
    }

    return {
      ...row,
      [targetColumn]: favorableValue,
    };
  });

  const afterSummaries = summarizeGroups(
    updatedRows,
    config.protectedAttribute,
    targetColumn,
    favorableValue
  );

  const afterBest = afterSummaries[0];
  const afterWorst = afterSummaries[afterSummaries.length - 1];
  const gapAfter =
    afterBest && afterWorst ? Math.max(0, afterBest.selectionRate - afterWorst.selectionRate) : gapBefore;

  return {
    rows: updatedRows,
    changed: selectedIndexes.length,
    gapBefore,
    gapAfter,
  };
}

export function autoFixDataset(rows: DataRow[], config: AuditConfig): MitigationResult {
  const logs: string[] = [];

  if (!config.protectedAttribute || rows.length === 0) {
    return { newData: rows, logs };
  }

  const targetColumn = config.predictionAttribute ?? config.outcomeAttribute;
  const favorableValue = config.favorablePrediction ?? config.favorableOutcome;

  if (!targetColumn || !favorableValue) {
    return { newData: rows, logs };
  }

  let nextRows = [...rows];
  let summaries = summarizeGroups(
    nextRows,
    config.protectedAttribute,
    targetColumn,
    favorableValue
  );

  const rebalanced = rebalanceMinoritySamples(nextRows, config.protectedAttribute, summaries);
  nextRows = rebalanced.rows;

  if (rebalanced.log) {
    logs.push(rebalanced.log);
    summaries = summarizeGroups(
      nextRows,
      config.protectedAttribute,
      targetColumn,
      favorableValue
    );
  }

  const improved = improveSelectionGap(nextRows, config, summaries);
  nextRows = improved.rows;

  if (improved.changed > 0) {
    logs.push(
      `Adjusted ${improved.changed} records to reduce selection-rate gap from ${formatGap(improved.gapBefore)} to ${formatGap(improved.gapAfter)}.`
    );
  }

  if (logs.length === 0) {
    logs.push("No strong bias correction was required based on current mitigation thresholds.");
  }

  return { newData: nextRows, logs };
}

function formatGap(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}