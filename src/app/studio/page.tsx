"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Bot,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Play,
  ShieldAlert,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import {
  getDistinctColumnValues,
  inferPositiveLabel,
  parseDatasetFile,
  suggestColumns,
  type ParsedCsv,
} from "@/lib/csv";
import { runFairnessAudit } from "@/lib/fairness";
import { TEMPLATES } from "@/lib/templates";
import { autoFixDataset } from "@/lib/mitigation";
import { buildMlFallbackAssessment } from "@/lib/assessment-fallback";
import type { AiAssessment, AuditConfig, AuditResult, DataRow } from "@/lib/types";
import { formatPercent } from "@/lib/utils";
import { BiasTimeline } from "@/components/bias-timeline";
import { FeatureImportanceChart } from "@/components/feature-importance-chart";
import { FairnessRadar } from "@/components/fairness-radar";
import { GapHeatmap } from "@/components/gap-heatmap";
import { GroupRateChart } from "@/components/group-rate-chart";
import { RiskGauge } from "@/components/risk-gauge";

const PREVIEW_ROWS_LIMIT = 8;
const PREVIEW_COLUMNS_LIMIT = 8;

const CONTROL_CLASSNAME =
  "mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white/85 px-3 py-2 text-sm font-medium text-[color:var(--ink-0)] outline-none transition focus:border-[color:var(--signal)] focus:ring-2 focus:ring-[color:var(--signal-soft)]";

const EMPTY_CONFIG: AuditConfig = {
  protectedAttribute: "",
  outcomeAttribute: "",
  favorableOutcome: "",
  predictionAttribute: undefined,
  favorablePrediction: undefined,
  referenceGroup: undefined,
  intersectionAttribute: undefined,
  minGroupSize: 20,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while processing the dataset.";
}

function priorityClass(priority: "high" | "medium" | "low"): string {
  if (priority === "high") {
    return "risk-critical";
  }

  if (priority === "medium") {
    return "risk-warn";
  }

  return "risk-good";
}

function severityClass(severity: "good" | "warning" | "critical"): string {
  if (severity === "critical") {
    return "risk-critical";
  }

  if (severity === "warning") {
    return "risk-warn";
  }

  return "risk-good";
}

function buildMarkdownReport(
  datasetName: string,
  config: AuditConfig,
  report: AuditResult,
  aiAssessment: AiAssessment | null
): string {
  const metricRows = report.metrics
    .map(
      (metric) =>
        `| ${metric.label} | ${metric.displayValue} | ${metric.target} | ${metric.severity.toUpperCase()} | ${metric.confidenceInterval?.display ?? "-"} |`
    )
    .join("\n");

  const recommendationRows = report.recommendations
    .map(
      (recommendation, index) =>
        `${index + 1}. **${recommendation.title}** (${recommendation.priority.toUpperCase()})\n   - ${recommendation.detail}\n   - Suggested fix: ${recommendation.suggestedFix}`
    )
    .join("\n");

  const groupRows = report.groupStats
    .map(
      (group) =>
        `| ${group.group} | ${group.total} | ${formatPercent(group.selectionRate)} | ${formatPercent(group.actualPositiveRate)} | ${group.tpr === null ? "N/A" : formatPercent(group.tpr)} | ${group.fpr === null ? "N/A" : formatPercent(group.fpr)} |`
    )
    .join("\n");

  const intersectionRows = report.intersectionalStats
    .map(
      (row) =>
        `| ${row.intersection} | ${row.total} | ${formatPercent(row.selectionRate)} | ${formatPercent(row.actualPositiveRate)} | ${row.severity.toUpperCase()} |`
    )
    .join("\n");

  return `# VeriFair Fairness Audit Report

## Dataset
- Name: ${datasetName}
- Rows: ${report.profile.rowCount}
- Columns: ${report.profile.columnCount}
- Generated at: ${new Date(report.profile.generatedAt).toLocaleString()}

## Configuration
- Protected attribute: ${config.protectedAttribute}
- Outcome attribute: ${config.outcomeAttribute}
- Favorable outcome: ${config.favorableOutcome}
- Prediction attribute: ${config.predictionAttribute ?? "Not provided"}
- Favorable prediction: ${config.favorablePrediction ?? "Not provided"}
- Intersection attribute: ${config.intersectionAttribute ?? "Not provided"}
- Minimum group size: ${config.minGroupSize ?? 20}

## Executive Summary
- Overall fairness risk score: **${report.overallRiskScore}/100**
- Fairness index: **${report.fairnessIndex}/100**
- Reference group: **${report.referenceGroup}**
- Summary: ${report.quickSummary}

## Data Quality
- Missing value rate: ${formatPercent(report.dataQuality.missingValueRate)}
- Duplicate row rate: ${formatPercent(report.dataQuality.duplicateRowRate)}
- Row validity rate: ${formatPercent(report.dataQuality.rowValidityRate)}

## Stability
- Bootstrap samples: ${report.stability.bootstrapSamples}
- Demographic parity CI: ${formatPercent(report.stability.demographicParityDifferenceCI.low)} to ${formatPercent(report.stability.demographicParityDifferenceCI.high)}
- Disparate impact CI: ${report.stability.disparateImpactRatioCI.low.toFixed(2)} to ${report.stability.disparateImpactRatioCI.high.toFixed(2)}

## Metrics
| Metric | Value | Target | Severity | CI |
|---|---:|---|---|---|
${metricRows}

## Group Performance
| Group | Count | Selection Rate | Actual Outcome Rate | TPR | FPR |
|---|---:|---:|---:|---:|---:|
${groupRows}

## Intersectional Summary
| Intersection | Count | Selection Rate | Outcome Rate | Severity |
|---|---:|---:|---:|---|
${intersectionRows || "| Not available | - | - | - | - |"}

## Recommendations
${recommendationRows}

${
  aiAssessment
    ? `## Gemini AI Assessment\n- Model: ${aiAssessment.model}\n- Confidence: ${aiAssessment.confidence}\n- Summary: ${aiAssessment.summary}\n\n### Flagged Patterns\n${aiAssessment.flaggedPatterns.map((item) => `- ${item}`).join("\n")}\n\n### Suggested Actions\n${aiAssessment.suggestedActions.map((item) => `- ${item}`).join("\n")}`
    : ""
}

## Notes
${report.analysisNotes.map((note) => `- ${note}`).join("\n")}
`;
}

function triggerDownload(content: string, type: string, fileName: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

export default function StudioPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [previewRows, setPreviewRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState<string>("No dataset loaded");

  const [config, setConfig] = useState<AuditConfig>(EMPTY_CONFIG);
  const [outcomeValues, setOutcomeValues] = useState<string[]>([]);
  const [predictionValues, setPredictionValues] = useState<string[]>([]);

  const [result, setResult] = useState<AuditResult | null>(null);
  const [aiAssessment, setAiAssessment] = useState<AiAssessment | null>(null);
  const [aiError, setAiError] = useState<string>("");
  const [assessmentSource, setAssessmentSource] = useState<
    "gemini" | "ml-fallback" | "ml-only"
  >("ml-only");
  const [error, setError] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [includeAiAssessment, setIncludeAiAssessment] = useState(true);
  const [runHistory, setRunHistory] = useState<
    { run: number; score: number; timestamp: string }[]
  >([]);
  const [fixLogs, setFixLogs] = useState<string[]>([]);

  const previewHeaders = headers.slice(0, PREVIEW_COLUMNS_LIMIT);

  const datasetStats = useMemo(() => {
    const groupCount = config.protectedAttribute
      ? new Set(rows.map((row) => String(row[config.protectedAttribute] ?? "Unknown").trim()))
          .size
      : 0;

    return {
      rowCount: rows.length,
      columnCount: headers.length,
      groupCount,
    };
  }, [config.protectedAttribute, headers.length, rows]);

  const canRunAudit =
    rows.length > 0 &&
    config.protectedAttribute.length > 0 &&
    config.outcomeAttribute.length > 0 &&
    config.favorableOutcome.length > 0;

  function applyDataset(parsed: ParsedCsv, datasetName: string): void {
    const inferredColumns = suggestColumns(parsed.headers);

    const defaultOutcome = inferredColumns.outcomeAttribute ?? parsed.headers[0] ?? "";
    const defaultPrediction = inferredColumns.predictionAttribute;
    const defaultProtected =
      inferredColumns.protectedAttribute ??
      parsed.headers.find(
        (header) => header !== defaultOutcome && header !== defaultPrediction
      ) ??
      parsed.headers[0] ??
      "";

    const defaultIntersection =
      parsed.headers.find(
        (header) =>
          header !== defaultProtected &&
          header !== defaultOutcome &&
          header !== defaultPrediction
      ) ?? undefined;

    const nextProtectedValues = defaultProtected
      ? getDistinctColumnValues(parsed.rows, defaultProtected)
      : [];

    const nextOutcomeValues = defaultOutcome
      ? getDistinctColumnValues(parsed.rows, defaultOutcome)
      : [];

    const nextPredictionValues = defaultPrediction
      ? getDistinctColumnValues(parsed.rows, defaultPrediction)
      : [];

    const inferredOutcome = defaultOutcome
      ? inferPositiveLabel(parsed.rows, defaultOutcome, nextOutcomeValues[0] ?? "approved")
      : "";

    const inferredPrediction = defaultPrediction
      ? inferPositiveLabel(
          parsed.rows,
          defaultPrediction,
          nextPredictionValues[0] ?? inferredOutcome
        )
      : undefined;

    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setPreviewRows(parsed.rows.slice(0, PREVIEW_ROWS_LIMIT));
    setFileName(datasetName);

    setOutcomeValues(nextOutcomeValues);
    setPredictionValues(nextPredictionValues);

    setConfig({
      protectedAttribute: defaultProtected,
      outcomeAttribute: defaultOutcome,
      favorableOutcome: nextOutcomeValues.includes(inferredOutcome)
        ? inferredOutcome
        : nextOutcomeValues[0] ?? "",
      predictionAttribute: defaultPrediction,
      favorablePrediction: defaultPrediction
        ? nextPredictionValues.includes(inferredPrediction ?? "")
          ? inferredPrediction
          : nextPredictionValues[0] ?? inferredOutcome
        : undefined,
      referenceGroup: nextProtectedValues[0],
      intersectionAttribute: defaultIntersection,
      minGroupSize: 20,
    });

    setResult(null);
    setAiAssessment(null);
    setAiError("");
    setAssessmentSource("ml-only");
    setError("");
    setRunHistory([]);
    setFixLogs([]);
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = await parseDatasetFile(file);
      applyDataset(parsed, file.name);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
      setResult(null);
    } finally {
      event.target.value = "";
    }
  }

  function handleLoadTemplate(index: number): void {
    const template = TEMPLATES[index];
    if (!template) {
      return;
    }

    applyDataset(template.dataset, `${template.name} (Demo)`);
  }

  function handleProtectedChange(value: string): void {
    const nextValues = value ? getDistinctColumnValues(rows, value) : [];

    setConfig((previous) => ({
      ...previous,
      protectedAttribute: value,
      referenceGroup: nextValues.includes(previous.referenceGroup ?? "")
        ? previous.referenceGroup
        : nextValues[0],
      intersectionAttribute:
        previous.intersectionAttribute === value
          ? undefined
          : previous.intersectionAttribute,
    }));

    setResult(null);
  }

  function handleOutcomeChange(value: string): void {
    const nextValues = value ? getDistinctColumnValues(rows, value) : [];
    const inferred = value
      ? inferPositiveLabel(rows, value, nextValues[0] ?? "approved")
      : "";

    setOutcomeValues(nextValues);

    setConfig((previous) => ({
      ...previous,
      outcomeAttribute: value,
      favorableOutcome: nextValues.includes(previous.favorableOutcome)
        ? previous.favorableOutcome
        : nextValues.includes(inferred)
        ? inferred
        : nextValues[0] ?? "",
    }));

    setResult(null);
  }

  function handlePredictionChange(value: string): void {
    const normalizedValue = value || undefined;
    const nextValues = normalizedValue ? getDistinctColumnValues(rows, normalizedValue) : [];
    const inferred = normalizedValue
      ? inferPositiveLabel(rows, normalizedValue, nextValues[0] ?? config.favorableOutcome)
      : undefined;

    setPredictionValues(nextValues);

    setConfig((previous) => ({
      ...previous,
      predictionAttribute: normalizedValue,
      favorablePrediction: normalizedValue
        ? nextValues.includes(previous.favorablePrediction ?? "")
          ? previous.favorablePrediction
          : nextValues.includes(inferred ?? "")
          ? inferred
          : nextValues[0] ?? previous.favorableOutcome
        : undefined,
    }));

    setResult(null);
  }

  async function runAudit(nextRows: DataRow[] = rows): Promise<void> {
    if (!canRunAudit) {
      setError("Upload a dataset and complete all required configuration fields first.");
      return;
    }

    setIsRunning(true);
    setAiError("");

    try {
      const response = await fetch("/api/analyze-bias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: nextRows,
          config,
          datasetName: fileName,
          includeAiAssessment,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        fairnessResult?: AuditResult;
        aiAssessment?: AiAssessment | null;
        aiError?: string | null;
        assessmentSource?: "gemini" | "ml-fallback" | "ml-only";
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Bias analysis request failed.");
      }

      if (!payload.fairnessResult) {
        throw new Error("No fairness report was returned by the API.");
      }

      const nextResult = payload.fairnessResult;
      setResult(nextResult);
      setAiAssessment(payload.aiAssessment ?? null);
      setAiError(payload.aiError ?? "");
      setAssessmentSource(
        payload.assessmentSource ?? (payload.aiAssessment ? "gemini" : "ml-only")
      );
      setRunHistory((previous) => [
        ...previous,
        {
          run: previous.length + 1,
          score: nextResult.overallRiskScore,
          timestamp: new Date().toISOString(),
        },
      ]);
      setError("");
    } catch (auditError) {
      try {
        const localFallback = runFairnessAudit(nextRows, config);
        setResult(localFallback);
        setRunHistory((previous) => [
          ...previous,
          {
            run: previous.length + 1,
            score: localFallback.overallRiskScore,
            timestamp: new Date().toISOString(),
          },
        ]);
        if (includeAiAssessment) {
          const fallbackReason =
            auditError instanceof Error
              ? auditError.message
              : "Gemini or API route was unavailable.";

          setAiAssessment(
            buildMlFallbackAssessment({
              report: localFallback,
              config,
              datasetName: fileName,
              reason: fallbackReason,
            })
          );
          setAssessmentSource("ml-fallback");
        } else {
          setAiAssessment(null);
          setAssessmentSource("ml-only");
        }

        if (includeAiAssessment) {
          setAiError(
            "Gemini assessment is unavailable right now. Local fairness audit completed successfully."
          );
        }

        setError("");
      } catch (fallbackError) {
        setResult(null);
        setAiAssessment(null);
        setAssessmentSource("ml-only");
        setError(getErrorMessage(fallbackError) || getErrorMessage(auditError));
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function handleAutoFixBias(): Promise<void> {
    if (!result || !canRunAudit) {
      return;
    }

    setIsRunning(true);

    try {
      const mitigation = autoFixDataset(rows, config);
      setRows(mitigation.newData);
      setPreviewRows(mitigation.newData.slice(0, PREVIEW_ROWS_LIMIT));
      setFixLogs(mitigation.logs);

      await runAudit(mitigation.newData);
      setError("");
    } catch (auditError) {
      setError(getErrorMessage(auditError));
    } finally {
      setIsRunning(false);
    }
  }

  function handleExportJson(): void {
    if (!result) {
      return;
    }

    const cleanName = fileName.replace(/\.[^.]+$/, "") || "dataset";

    triggerDownload(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          dataset: fileName,
          configuration: config,
          report: result,
          aiAssessment,
          aiError: aiError || null,
        },
        null,
        2
      ),
      "application/json",
      `${cleanName}-VeriFair-report.json`
    );
  }

  function handleExportMarkdown(): void {
    if (!result) {
      return;
    }

    const cleanName = fileName.replace(/\.[^.]+$/, "") || "dataset";

    triggerDownload(
      buildMarkdownReport(fileName, config, result, aiAssessment),
      "text/markdown;charset=utf-8",
      `${cleanName}-VeriFair-report.md`
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-clip pb-16 pt-24 md:pb-20 md:pt-28">
      <div className="animate-drift pointer-events-none absolute -left-20 top-6 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(13,122,95,0.28),rgba(13,122,95,0)_72%)]" />
      <div className="animate-sweep pointer-events-none absolute -right-16 top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(232,179,76,0.24),rgba(232,179,76,0)_72%)]" />

      <div className="fixed inset-x-0 top-0 z-40 border-b border-[color:var(--line)] bg-[rgba(246,247,244,0.9)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 md:px-8">
          <div className="min-w-0">
            <p className="section-kicker">VeriFair Studio</p>
            <p className="truncate text-xs font-semibold text-[color:var(--ink-1)] sm:text-sm">
              {result
                ? `Risk ${result.overallRiskScore}/100 • Fairness Index ${result.fairnessIndex}/100 • ${fileName}`
                : `Dataset: ${fileName}`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void runAudit()}
            disabled={!canRunAudit || isRunning}
            className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
          >
            <Play className="h-4 w-4" />
            {isRunning ? "Running..." : "Run Audit"}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1280px] px-4 md:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Fairness Operations Workspace</p>
            <h1 className="display-title mt-2 text-3xl font-black leading-tight text-[color:var(--ink-0)] sm:text-4xl md:text-5xl">
              Professional Bias Analysis Console
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)] md:text-base">
              Stronger audit logic with confidence intervals, intersectional diagnostics,
              data-quality profiling, and Gemini-powered AI interpretation.
            </p>
          </div>

          <Link
            href="/"
            className="btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Overview
          </Link>
        </header>

        <section className="surface shell mb-6 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <span className="pill">Rows {datasetStats.rowCount}</span>
            <span className="pill">Columns {datasetStats.columnCount}</span>
            <span className="pill">Groups {datasetStats.groupCount}</span>
            {result ? <span className="pill">Risk {result.overallRiskScore}/100</span> : null}
            {result ? <span className="pill">Fairness {result.fairnessIndex}/100</span> : null}
          </div>
          <p className="mt-2 text-xs text-[color:var(--muted)]">Active dataset: {fileName}</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <motion.section
              className="surface shell-tight p-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <h2 className="text-lg font-bold text-[color:var(--ink-0)]">Dataset Ingestion</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Upload CSV/JSON or use challenge-ready demos.
              </p>

              <label
                htmlFor="datasetUpload"
                className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[color:var(--line)] bg-white/70 px-4 py-7 text-center transition hover:border-[color:var(--line-strong)]"
              >
                <UploadCloud className="h-5 w-5 text-[color:var(--signal)]" />
                <span className="text-sm font-semibold text-[color:var(--ink-0)]">Upload Dataset</span>
                <span className="text-xs text-[color:var(--muted)]">CSV or JSON arrays</span>
              </label>
              <input
                id="datasetUpload"
                type="file"
                accept=".csv,text/csv,application/json,.json"
                className="sr-only"
                onChange={handleFileUpload}
              />

              <div className="mt-3 grid gap-2">
                {TEMPLATES.map((tpl, index) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleLoadTemplate(index)}
                    className="btn-secondary inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm"
                  >
                    <FlaskConical className="h-4 w-4" />
                    Load {tpl.name}
                  </button>
                ))}
              </div>
            </motion.section>

            <motion.section
              className="surface shell-tight p-5"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: 0.04 }}
            >
              <h2 className="text-lg font-bold text-[color:var(--ink-0)]">Audit Configuration</h2>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Protected Attribute
                <select
                  className={CONTROL_CLASSNAME}
                  value={config.protectedAttribute}
                  onChange={(event) => handleProtectedChange(event.target.value)}
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Outcome Attribute
                <select
                  className={CONTROL_CLASSNAME}
                  value={config.outcomeAttribute}
                  onChange={(event) => handleOutcomeChange(event.target.value)}
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Favorable Outcome Value
                <select
                  className={CONTROL_CLASSNAME}
                  value={config.favorableOutcome}
                  onChange={(event) =>
                    setConfig((previous) => ({
                      ...previous,
                      favorableOutcome: event.target.value,
                    }))
                  }
                  disabled={outcomeValues.length === 0}
                >
                  {outcomeValues.length === 0 ? <option value="">Select outcome first</option> : null}
                  {outcomeValues.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Prediction Attribute (Optional)
                <select
                  className={CONTROL_CLASSNAME}
                  value={config.predictionAttribute ?? ""}
                  onChange={(event) => handlePredictionChange(event.target.value)}
                >
                  <option value="">No prediction column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>

              {config.predictionAttribute ? (
                <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Favorable Prediction Value
                  <select
                    className={CONTROL_CLASSNAME}
                    value={config.favorablePrediction ?? ""}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        favorablePrediction: event.target.value,
                      }))
                    }
                    disabled={predictionValues.length === 0}
                  >
                    {predictionValues.length === 0 ? <option value="">No values detected</option> : null}
                    {predictionValues.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Intersection Attribute (Optional)
                <select
                  className={CONTROL_CLASSNAME}
                  value={config.intersectionAttribute ?? ""}
                  onChange={(event) =>
                    setConfig((previous) => ({
                      ...previous,
                      intersectionAttribute: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">No intersection column</option>
                  {headers
                    .filter((header) => header !== config.protectedAttribute)
                    .map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                </select>
              </label>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Minimum Group Size
                <input
                  type="number"
                  min={5}
                  max={500}
                  className={CONTROL_CLASSNAME}
                  value={config.minGroupSize ?? 20}
                  onChange={(event) =>
                    setConfig((previous) => ({
                      ...previous,
                      minGroupSize: Math.max(5, Number(event.target.value || 20)),
                    }))
                  }
                />
              </label>

              <label className="mt-4 flex items-start gap-2 rounded-lg border border-[color:var(--line)] bg-white/70 px-3 py-2.5 text-sm text-[color:var(--ink-1)]">
                <input
                  type="checkbox"
                  checked={includeAiAssessment}
                  onChange={(event) => setIncludeAiAssessment(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[color:var(--signal)]"
                />
                <span>
                  Enable Gemini AI assessment for narrative bias detection and action planning.
                </span>
              </label>

              <button
                type="button"
                onClick={() => void runAudit()}
                disabled={!canRunAudit || isRunning}
                className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm disabled:opacity-55"
              >
                <Play className="h-4 w-4" />
                {isRunning ? "Running Audit..." : "Run Full Analysis"}
              </button>
            </motion.section>
          </aside>

          <section className="space-y-5">
            {error ? (
              <div className="surface shell-tight border border-rose-300/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                  <p>{error}</p>
                </div>
              </div>
            ) : null}

            {result ? (
              <motion.div
                className="space-y-5"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <section className="surface shell p-5 md:p-6">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <p className="section-kicker">Executive Signal</p>
                      <h2 className="display-title mt-2 text-2xl font-black text-[color:var(--ink-0)] sm:text-3xl md:text-4xl">
                        {result.quickSummary}
                      </h2>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">Fairness Index {result.fairnessIndex}/100</span>
                        <span className="pill">Reference Group {result.referenceGroup}</span>
                        <span className="pill">Rows {result.profile.rowCount}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-3 md:items-center">
                      <RiskGauge score={result.overallRiskScore} />
                      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                        <button
                          type="button"
                          onClick={handleExportJson}
                          className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:flex-none"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export JSON
                        </button>
                        <button
                          type="button"
                          onClick={handleExportMarkdown}
                          className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:flex-none"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export MD
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="surface shell p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Metric Diagnostics</h3>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      confidence-aware
                    </span>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          <th className="px-3 py-1 text-left">Metric</th>
                          <th className="px-3 py-1 text-left">Value</th>
                          <th className="px-3 py-1 text-left">Target</th>
                          <th className="px-3 py-1 text-left">Severity</th>
                          <th className="px-3 py-1 text-left">CI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.metrics.map((metric) => (
                          <tr key={metric.key} className="metric-strip">
                            <td className="px-3 py-2.5 font-semibold text-[color:var(--ink-0)]">
                              {metric.label}
                            </td>
                            <td className="mono-number px-3 py-2.5 font-bold text-[color:var(--ink-0)]">
                              {metric.displayValue}
                            </td>
                            <td className="px-3 py-2.5 text-[color:var(--muted)]">{metric.target}</td>
                            <td className={`px-3 py-2.5 font-bold uppercase ${severityClass(metric.severity)}`}>
                              {metric.severity}
                            </td>
                            <td className="px-3 py-2.5 text-[color:var(--muted)]">
                              {metric.confidenceInterval?.display ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-2">
                  <article className="surface shell-tight p-5">
                    <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Group Outcome vs Selection</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Compare model-selected outcomes against observed positives by group.
                    </p>
                    <div className="mt-3">
                      <GroupRateChart groups={result.groupStats} />
                    </div>
                  </article>

                  <article className="surface shell-tight p-5">
                    <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Fairness Risk Surface</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Radar map of metric-level risk contribution.
                    </p>
                    <div className="mt-3">
                      <FairnessRadar metrics={result.metrics} />
                    </div>
                  </article>
                </section>

                <section className="grid gap-5 xl:grid-cols-2">
                  <article className="surface shell-tight p-5">
                    <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Group Gap Matrix</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Gap view relative to reference group <b>{result.referenceGroup}</b>.
                    </p>
                    <div className="mt-3">
                      <GapHeatmap rows={result.groupComparisons} referenceGroup={result.referenceGroup} />
                    </div>
                  </article>

                  <article className="surface shell-tight p-5">
                    <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Feature Influence</h3>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      Correlation-driven explainability snapshot of influential variables.
                    </p>
                    <div className="mt-3">
                      <FeatureImportanceChart
                        scores={result.featureImportance || []}
                        protectedAttribute={config.protectedAttribute}
                      />
                    </div>
                  </article>
                </section>

                <section className="surface shell p-5">
                  <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Mitigation Playbook</h3>
                      <div className="mt-3 space-y-2">
                        {result.recommendations.map((recommendation) => (
                          <div key={recommendation.id} className="metric-strip px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-[color:var(--ink-0)]">{recommendation.title}</p>
                              <span className={`text-xs font-bold uppercase ${priorityClass(recommendation.priority)}`}>
                                {recommendation.priority}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[color:var(--muted)]">{recommendation.detail}</p>
                            <p className="mt-1 text-xs font-semibold text-[color:var(--ink-1)]">
                              Suggested Fix: {recommendation.suggestedFix}
                            </p>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleAutoFixBias()}
                        disabled={isRunning}
                        className="btn-primary mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50"
                      >
                        <WandSparkles className="h-4 w-4" />
                        Auto Fix Bias
                      </button>

                      {fixLogs.length > 0 ? (
                        <div className="mt-3 rounded-lg border border-[color:var(--line)] bg-white/75 px-3 py-2.5">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                            Mitigation Summary
                          </p>
                          <ul className="mt-1 space-y-1 text-sm text-[color:var(--ink-1)]">
                            {fixLogs.map((log, index) => (
                              <li key={`fix_${index}`}>- {log}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Stability + Data Quality</h3>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="metric-strip flex items-center justify-between px-3 py-2">
                          <span className="text-[color:var(--muted)]">Bootstrap Samples</span>
                          <span className="mono-number font-bold text-[color:var(--ink-0)]">
                            {result.stability.bootstrapSamples}
                          </span>
                        </div>
                        <div className="metric-strip flex items-center justify-between px-3 py-2">
                          <span className="text-[color:var(--muted)]">Missing Value Rate</span>
                          <span className="mono-number font-bold text-[color:var(--ink-0)]">
                            {formatPercent(result.dataQuality.missingValueRate)}
                          </span>
                        </div>
                        <div className="metric-strip flex items-center justify-between px-3 py-2">
                          <span className="text-[color:var(--muted)]">Duplicate Row Rate</span>
                          <span className="mono-number font-bold text-[color:var(--ink-0)]">
                            {formatPercent(result.dataQuality.duplicateRowRate)}
                          </span>
                        </div>
                        <div className="metric-strip flex items-center justify-between px-3 py-2">
                          <span className="text-[color:var(--muted)]">Row Validity Rate</span>
                          <span className="mono-number font-bold text-[color:var(--ink-0)]">
                            {formatPercent(result.dataQuality.rowValidityRate)}
                          </span>
                        </div>
                      </div>

                      {result.intersectionalStats.length > 0 ? (
                        <div className="mt-4 overflow-x-auto">
                          <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                            <thead>
                              <tr className="text-[color:var(--muted)]">
                                <th className="px-2 py-1 text-left">Intersection</th>
                                <th className="px-2 py-1 text-left">Count</th>
                                <th className="px-2 py-1 text-left">Selection</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.intersectionalStats.map((entry) => (
                                <tr key={entry.intersection} className="metric-strip">
                                  <td className="px-2 py-1.5 text-[color:var(--ink-1)]">{entry.intersection}</td>
                                  <td className="mono-number px-2 py-1.5 text-[color:var(--ink-0)]">{entry.total}</td>
                                  <td className="mono-number px-2 py-1.5 text-[color:var(--ink-0)]">
                                    {formatPercent(entry.selectionRate)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="surface shell p-5">
                  <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Bias Timeline</h3>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Track fairness risk movement across repeated audits and mitigation loops.
                  </p>
                  <div className="mt-4">
                    <BiasTimeline history={runHistory} />
                  </div>
                </section>

                {includeAiAssessment ? (
                  <section className="surface shell p-5">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-[color:var(--signal)]" />
                      <h3 className="text-lg font-bold text-[color:var(--ink-0)]">AI Bias Assessment</h3>
                    </div>

                    {aiError ? (
                      <p className="mt-2 text-sm text-[color:var(--warn)]">{aiError}</p>
                    ) : null}

                    {aiAssessment ? (
                      <div className="mt-3 space-y-3">
                        <div className="metric-strip px-3 py-2.5">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                            Summary
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-1)]">
                            {aiAssessment.summary}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="pill">
                              Source {assessmentSource === "gemini" ? "Gemini" : "ML fallback"}
                            </span>
                            <span className="pill">Model {aiAssessment.model}</span>
                            <span className="pill">Confidence {aiAssessment.confidence}</span>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="metric-strip px-3 py-2.5">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                              Flagged Patterns
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-[color:var(--ink-1)]">
                              {(aiAssessment.flaggedPatterns.length > 0
                                ? aiAssessment.flaggedPatterns
                                : ["No additional patterns flagged by AI."]
                              ).map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="metric-strip px-3 py-2.5">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                              Suggested Actions
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-[color:var(--ink-1)]">
                              {(aiAssessment.suggestedActions.length > 0
                                ? aiAssessment.suggestedActions
                                : ["No extra actions suggested by AI."]
                              ).map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[color:var(--muted)]">
                        Run analysis with AI enabled to generate a Gemini interpretation.
                      </p>
                    )}
                  </section>
                ) : null}
              </motion.div>
            ) : (
              <section className="surface shell p-8">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--line)] bg-white/80">
                    <FileSpreadsheet className="h-6 w-6 text-[color:var(--signal)]" />
                  </div>
                  <h2 className="display-title mt-4 text-3xl font-black text-[color:var(--ink-0)]">
                    Ready to audit for bias?
                  </h2>
                  <p className="mt-2 text-sm text-[color:var(--muted)] md:text-base">
                    Upload data, configure fairness fields, and run a full analysis with optional
                    Gemini AI interpretation.
                  </p>
                </div>
              </section>
            )}

            {rows.length > 0 ? (
              <section className="surface shell p-5">
                <h3 className="text-lg font-bold text-[color:var(--ink-0)]">Dataset Preview</h3>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  Showing first {previewRows.length} rows and up to {previewHeaders.length} columns.
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-1 text-sm">
                    <thead>
                      <tr>
                        {previewHeaders.map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, rowIndex) => (
                        <tr key={`preview_row_${rowIndex}`} className="metric-strip">
                          {previewHeaders.map((header) => (
                            <td key={`${rowIndex}_${header}`} className="px-3 py-2 text-[color:var(--ink-0)]">
                              {String(row[header] ?? "-")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}