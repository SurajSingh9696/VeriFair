export type RawValue = string | number | boolean | null | undefined;
export type DataRow = Record<string, RawValue>;

export type Severity = "good" | "warning" | "critical";
export type RecommendationPriority = "high" | "medium" | "low";

export interface AuditConfig {
  protectedAttribute: string;
  outcomeAttribute: string;
  favorableOutcome: string;
  predictionAttribute?: string;
  favorablePrediction?: string;
  referenceGroup?: string;
  intersectionAttribute?: string;
  minGroupSize?: number;
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  groupsAnalyzed: number;
  hasPredictions: boolean;
  generatedAt: string;
}

export interface GroupStat {
  group: string;
  total: number;
  populationShare: number;
  actualPositive: number;
  predictedPositive: number;
  actualPositiveRate: number;
  selectionRate: number;
  tpr: number | null;
  fpr: number | null;
  precision: number | null;
}

export interface MetricScore {
  key: string;
  label: string;
  description: string;
  target: string;
  value: number;
  displayValue: string;
  severity: Severity;
  riskContribution: number;
  weight: number;
  confidenceInterval?: {
    low: number;
    high: number;
    display: string;
  };
}

export interface GroupComparison {
  group: string;
  selectionRateGap: number;
  representationGap: number;
  tprGap: number | null;
  fprGap: number | null;
  precisionGap: number | null;
  overallGap: number;
  severity: Severity;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  suggestedFix: string;
  priority: RecommendationPriority;
}

export interface FeatureImportanceScore {
  feature: string;
  importance: number;
}

export interface DataQualityProfile {
  duplicateRowCount: number;
  duplicateRowRate: number;
  missingValueRate: number;
  rowValidityRate: number;
  sparseColumns: string[];
  highCardinalityColumns: string[];
}

export interface IntersectionalGroupStat {
  intersection: string;
  total: number;
  selectionRate: number;
  actualPositiveRate: number;
  severity: Severity;
}

export interface StabilityProfile {
  bootstrapSamples: number;
  demographicParityDifferenceCI: {
    low: number;
    high: number;
  };
  disparateImpactRatioCI: {
    low: number;
    high: number;
  };
}

export interface AiAssessment {
  model: string;
  generatedAt: string;
  confidence: "low" | "medium" | "high";
  summary: string;
  flaggedPatterns: string[];
  suggestedActions: string[];
  rawText?: string;
}

export interface AuditResult {
  profile: DatasetProfile;
  dataQuality: DataQualityProfile;
  stability: StabilityProfile;
  referenceGroup: string;
  overallRiskScore: number;
  metrics: MetricScore[];
  groupStats: GroupStat[];
  groupComparisons: GroupComparison[];
  intersectionalStats: IntersectionalGroupStat[];
  recommendations: Recommendation[];
  biasFlags: string[];
  analysisNotes: string[];
  quickSummary: string;
  featureImportance: FeatureImportanceScore[];
  fairnessIndex: number;
  aiAssessment?: AiAssessment;
}
