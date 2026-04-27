import { z } from "zod";
import type { AiAssessment, AuditConfig, AuditResult } from "@/lib/types";

const GeminiSchema = z.object({
  summary: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  flaggedPatterns: z.array(z.string()).default([]),
  suggestedActions: z.array(z.string()).default([]),
});

interface GeminiAssessmentInput {
  report: AuditResult;
  config: AuditConfig;
  datasetName?: string;
}

function toPromptPayload(input: GeminiAssessmentInput): string {
  const topMetrics = input.report.metrics
    .slice(0, 8)
    .map((metric) => ({
      label: metric.label,
      value: metric.displayValue,
      severity: metric.severity,
      target: metric.target,
    }));

  const highGapGroups = input.report.groupComparisons.slice(0, 5).map((group) => ({
    group: group.group,
    overallGap: Number((group.overallGap * 100).toFixed(2)),
    severity: group.severity,
  }));

  const quality = input.report.dataQuality;

  return JSON.stringify(
    {
      context: {
        product: "VeriFair",
        datasetName: input.datasetName ?? "uploaded-dataset",
        generatedAt: new Date().toISOString(),
      },
      config: {
        protectedAttribute: input.config.protectedAttribute,
        outcomeAttribute: input.config.outcomeAttribute,
        favorableOutcome: input.config.favorableOutcome,
        predictionAttribute: input.config.predictionAttribute ?? null,
        favorablePrediction: input.config.favorablePrediction ?? null,
        intersectionAttribute: input.config.intersectionAttribute ?? null,
      },
      summary: {
        overallRiskScore: input.report.overallRiskScore,
        fairnessIndex: input.report.fairnessIndex,
        quickSummary: input.report.quickSummary,
      },
      dataQuality: {
        missingValueRate: Number((quality.missingValueRate * 100).toFixed(2)),
        duplicateRowRate: Number((quality.duplicateRowRate * 100).toFixed(2)),
        sparseColumns: quality.sparseColumns,
      },
      topMetrics,
      highGapGroups,
      recommendations: input.report.recommendations.slice(0, 6).map((item) => ({
        title: item.title,
        priority: item.priority,
      })),
    },
    null,
    2
  );
}

function extractJson(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

function getCandidateText(responseBody: unknown): string {
  if (!responseBody || typeof responseBody !== "object") {
    return "";
  }

  const body = responseBody as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("\n")
    .trim();

  return text ?? "";
}

export async function generateGeminiAssessment(
  input: GeminiAssessmentInput
): Promise<AiAssessment> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = [
    "You are an AI fairness auditor.",
    "Analyze the provided fairness report and return strict JSON only.",
    "Return this exact schema:",
    '{"summary":"string","confidence":"low|medium|high","flaggedPatterns":["string"],"suggestedActions":["string"]}',
    "Keep summary concise (2-4 sentences), and make actions concrete.",
    "If confidence is uncertain due to small samples, return confidence=low.",
    "Report payload:",
    toPromptPayload(input),
  ].join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        topP: 0.9,
        maxOutputTokens: 800,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const candidateText = getCandidateText(payload);

  if (!candidateText) {
    throw new Error("Gemini API returned an empty response.");
  }

  const jsonText = extractJson(candidateText);

  let parsed: z.infer<typeof GeminiSchema>;

  try {
    parsed = GeminiSchema.parse(JSON.parse(jsonText));
  } catch {
    parsed = {
      summary: candidateText,
      confidence: "medium",
      flaggedPatterns: [],
      suggestedActions: [],
    };
  }

  return {
    model,
    generatedAt: new Date().toISOString(),
    confidence: parsed.confidence,
    summary: parsed.summary,
    flaggedPatterns: parsed.flaggedPatterns,
    suggestedActions: parsed.suggestedActions,
    rawText: candidateText,
  };
}
