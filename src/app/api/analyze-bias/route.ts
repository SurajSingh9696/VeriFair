import { NextResponse } from "next/server";
import { runFairnessAudit } from "@/lib/fairness";
import type { AuditConfig, DataRow } from "@/lib/types";
import { generateGeminiAssessment } from "@/lib/gemini";
import { buildMlFallbackAssessment } from "@/lib/assessment-fallback";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      rows,
      config,
      datasetName,
      includeAiAssessment,
    } = body as {
      rows: DataRow[];
      config: AuditConfig;
      datasetName?: string;
      includeAiAssessment?: boolean;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or empty 'rows' provided." },
        { status: 400 }
      );
    }

    if (!config || !config.protectedAttribute || !config.outcomeAttribute || !config.favorableOutcome) {
      return NextResponse.json(
        { error: "Missing required configuration fields (protectedAttribute, outcomeAttribute, favorableOutcome)." },
        { status: 400 }
      );
    }

    const result = runFairnessAudit(rows, config);

    let aiAssessment = null;
    let aiError: string | null = null;
    let assessmentSource: "gemini" | "ml-fallback" | "ml-only" = "ml-only";

    if (includeAiAssessment) {
      try {
        aiAssessment = await generateGeminiAssessment({
          report: result,
          config,
          datasetName,
        });
        assessmentSource = "gemini";
      } catch (error) {
        aiError = error instanceof Error ? error.message : "Gemini assessment failed.";
        aiAssessment = buildMlFallbackAssessment({
          report: result,
          config,
          datasetName,
          reason: aiError,
        });
        assessmentSource = "ml-fallback";
      }
    }

    return NextResponse.json({
      success: true,
      biasScore: result.overallRiskScore,
      fairnessIndex: result.fairnessIndex,
      warning: result.biasFlags.length > 0 ? result.biasFlags[0] : null,
      fairnessResult: result,
      aiAssessment,
      aiError,
      assessmentSource,
    });
  } catch (error) {
    console.error("Bias analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred during bias analysis." },
      { status: 500 }
    );
  }
}
