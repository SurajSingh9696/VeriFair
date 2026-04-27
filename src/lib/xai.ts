import { AuditConfig, DataRow, FeatureImportanceScore } from "@/lib/types";
import { normalizeToken } from "@/lib/utils";

// Helper for XAI Feature Importance correlation mock
export function calculateFeatureImportance(
  rows: DataRow[],
  config: AuditConfig
): FeatureImportanceScore[] {
  if (rows.length === 0) return [];

  const targetCol = config.predictionAttribute || config.outcomeAttribute;
  if (!targetCol) return [];

  const targetVal = config.favorablePrediction || config.favorableOutcome;
  const normalizedTarget = normalizeToken(targetVal);

  const features = Object.keys(rows[0]).filter((key) => {
    const normalized = key.toLowerCase();
    if (key === targetCol) {
      return false;
    }

    // Filter ID-like keys that create noisy pseudo-importance.
    return !normalized.includes("id") && !normalized.includes("uuid");
  });

  const scores: FeatureImportanceScore[] = [];

  for (const feature of features) {
    const values = rows
      .map((row) => row[feature])
      .filter((value) => value !== null && value !== undefined);

    if (values.length === 0) {
      continue;
    }

    const isNumericFeature = values.every((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed);
    });

    let importance = 0;

    // Numeric features: point-biserial style signal using distance between positive and negative means.
    if (isNumericFeature) {
      const positives: number[] = [];
      const negatives: number[] = [];

      for (const row of rows) {
        const raw = row[feature];
        if (raw === null || raw === undefined) {
          continue;
        }

        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          continue;
        }

        const isPositive = normalizeToken(row[targetCol]) === normalizedTarget;
        if (isPositive) {
          positives.push(numeric);
        } else {
          negatives.push(numeric);
        }
      }

      if (positives.length > 0 && negatives.length > 0) {
        const positiveMean = positives.reduce((sum, value) => sum + value, 0) / positives.length;
        const negativeMean = negatives.reduce((sum, value) => sum + value, 0) / negatives.length;

        const all = [...positives, ...negatives];
        const mean = all.reduce((sum, value) => sum + value, 0) / all.length;
        const variance =
          all.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / Math.max(all.length, 1);
        const std = Math.sqrt(variance);

        importance = std > 0 ? Math.abs(positiveMean - negativeMean) / std : 0;
      }
    } else {
      // Categorical features: weighted variance in positive-rate by category.
      const frequency = new Map<string, { total: number; positive: number }>();

      for (const row of rows) {
        const value = normalizeToken(row[feature]);
        if (!value) {
          continue;
        }

        const isPositive = normalizeToken(row[targetCol]) === normalizedTarget;
        const current = frequency.get(value) ?? { total: 0, positive: 0 };
        current.total += 1;

        if (isPositive) {
          current.positive += 1;
        }

        frequency.set(value, current);
      }

      const globalPositiveRate =
        rows.reduce(
          (sum, row) => sum + (normalizeToken(row[targetCol]) === normalizedTarget ? 1 : 0),
          0
        ) / Math.max(1, rows.length);

      for (const item of frequency.values()) {
        const rate = item.total > 0 ? item.positive / item.total : 0;
        const weight = item.total / rows.length;
        importance += weight * Math.pow(rate - globalPositiveRate, 2);
      }

      importance = Math.sqrt(importance) * 2;
    }

    if (feature === config.protectedAttribute) {
      importance *= 1.2;
    }

    if (importance > 0) {
      scores.push({ feature, importance });
    }
  }

  const maxImportance = Math.max(...scores.map((item) => item.importance), 0);
  if (maxImportance > 0) {
    scores.forEach((score) => {
      score.importance = (score.importance / maxImportance) * 100;
    });
  }

  scores.sort((left, right) => right.importance - left.importance);

  return scores.slice(0, 10);
}
