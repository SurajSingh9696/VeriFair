# VeriFair

AI Fairness Intelligence Platform for the Google Solution Challenge 2026.

VeriFair addresses the problem statement:

"Unbiased AI Decision: Ensuring Fairness and Detecting Bias in Automated Decisions"

The platform helps organizations inspect datasets and AI decision outcomes for hidden discrimination before those systems affect hiring, lending, healthcare, and other life-changing decisions.

## What Makes This Project Different

- Professional modern audit studio with responsive motion-driven UI
- Dataset upload plus one-click biased demo data mode
- Automated fairness metric computation with stability-aware risk scoring
- Visual decision intelligence: comparison charts, radar risk map, gap matrix, and timeline
- Data quality intelligence (missingness, duplicates, sparse/high-cardinality columns)
- Intersectional fairness diagnostics (for example gender x region)
- Actionable mitigation playbook with prioritized recommendations and auto-fix simulation
- Gemini-powered AI fairness assessment and action narrative
- One-click export of full reports in JSON and Markdown

## Core Features

- Landing page with challenge narrative and product positioning
- Interactive audit studio at /studio
- Smart CSV column suggestion and positive label inference
- Dataset profiling (rows, columns, detected protected groups)
- Bias flag generation and fairness summary scoring (0-100)
- Fairness Index (inverse risk signal) for executive communication
- Reference-group analysis and severity tagging
- Bootstrap confidence intervals for key fairness metrics
- Minimum group size controls for audit reliability
- Human-readable analysis notes for non-technical stakeholders

## Fairness Metrics Implemented

- Demographic Parity Difference
- Disparate Impact Ratio (80% rule style check)
- Representation Balance Ratio
- Equal Opportunity Difference (when predictions are available)
- False Positive Rate Difference (when predictions are available)
- Predictive Parity Difference (when predictions are available)
- Selection Rate Dispersion
- Equalized Odds Difference (when predictions are available)

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS 4
- Recharts for visual analytics
- Motion for animations
- PapaParse for CSV parsing
- Lucide icons
- Gemini API for AI fairness explanation
- Strict TypeScript with production build validation

## Project Structure

- src/app/page.tsx: Landing and storytelling entry page
- src/app/studio/page.tsx: Full audit workflow and report export
- src/lib/fairness.ts: Fairness engine and recommendation generation
- src/lib/csv.ts: CSV parsing, column suggestion, value inference
- src/lib/sample-data.ts: Synthetic challenge dataset generator
- src/components/: Charts and fairness UI components

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Configure environment variables

```bash
cp .env.example .env.local
```

Set your Gemini key in `.env.local`:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
```

3. Start development server

```bash
npm run dev
```

4. Open the app

- Home: http://localhost:3000
- Audit Studio: http://localhost:3000/studio

## Build and Validate

```bash
npm run lint
npm run build
```

Both commands pass successfully in the current implementation.

## How to Use (Demo Flow)

1. Open /studio
2. Click Load Challenge Demo Data (or upload your own CSV)
3. Confirm protected attribute and outcome columns
4. Optionally set prediction column, intersection column, and minimum group size
5. Enable Gemini AI assessment if desired
6. Click Run Fairness Audit
7. Review risk score, fairness index, confidence intervals, charts, recommendations, and AI notes
8. Optionally run Auto Fix Bias and compare timeline movement
9. Export report in JSON or Markdown

## Suggested CSV Format

Minimum columns:

- One protected attribute (for example gender, ethnicity, age_group)
- One outcome column (actual decision or label)

Optional but recommended:

- Prediction column (model output) for advanced error-rate fairness checks

## Why This Is Hackathon-Ready

- Problem-to-solution narrative aligned to Solution Challenge goals
- Visually strong and demo-friendly interface
- Quantitative fairness analysis and qualitative recommendation output
- Runs locally without external API keys or infrastructure setup

## Next Expansion Ideas

- Add intersectional fairness analysis (for example gender x region)
- Add drift tracking over time for repeated audits
- Integrate explainability overlays (feature-level fairness attribution)
- Connect with cloud storage + team collaboration workflows
# VeriFair
