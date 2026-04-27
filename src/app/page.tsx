import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  FlaskConical,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const capabilities = [
  {
    title: "Fairness Signal Engine",
    detail:
      "Combines parity, impact, equalized odds, and stability-aware confidence intervals into one fairness profile.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "AI Investigator",
    detail:
      "Gemini-powered narrative explains likely bias patterns and translates metrics into practical interventions.",
    icon: ScanLine,
  },
  {
    title: "Mitigation Workbench",
    detail:
      "Run automatic mitigation simulations, compare risk movement, and export stakeholder-ready reports.",
    icon: ShieldCheck,
  },
];

const flow = [
  "Import CSV/JSON or load challenge scenarios",
  "Map protected/outcome/prediction fields",
  "Run fairness diagnostics with confidence intervals",
  "Review AI explanation and mitigation strategy",
  "Export report for compliance and leadership",
];

export default function Home() {
  return (
    <main className="relative flex-1 overflow-x-clip pb-20 pt-8 md:pt-12">
      <div className="animate-drift pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(13,122,95,0.28),rgba(13,122,95,0)_72%)]" />
      <div className="animate-sweep pointer-events-none absolute -right-20 top-18 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(232,179,76,0.24),rgba(232,179,76,0)_72%)]" />

      <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
        <section className="surface shell overflow-hidden px-6 py-10 md:px-10 md:py-12">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="section-kicker">Google Solution Challenge 2026</p>
              <h1 className="display-title mt-3 text-5xl font-black leading-[0.98] text-[color:var(--ink-0)] md:text-7xl">
                VeriFair
                <span className="block text-[color:var(--signal)]">Bias Intelligence Platform</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-[color:var(--muted)] md:text-lg">
                Professional-grade fairness diagnostics for high-stakes AI systems in hiring,
                lending, healthcare, and public services. Measure hidden discrimination,
                explain risk, and deploy mitigation with confidence.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/studio"
                  className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm"
                >
                  Open Audit Studio
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#capabilities"
                  className="btn-secondary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm"
                >
                  Explore Platform
                </a>
              </div>
            </div>

            <div className="surface shell-tight divider-grid overflow-hidden p-5 md:p-6">
              <p className="section-kicker">Live Challenge Focus</p>
              <h2 className="display-title mt-2 text-3xl font-extrabold text-[color:var(--ink-0)]">
                Detect. Explain. Correct.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)] md:text-base">
                Move from static fairness checks to continuous decision intelligence with
                confidence-aware scoring and AI-guided mitigation recommendations.
              </p>

              <div className="mt-4 space-y-2">
                <div className="metric-strip flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Coverage
                  </span>
                  <span className="mono-number text-sm font-bold text-[color:var(--ink-0)]">
                    8+ fairness diagnostics
                  </span>
                </div>
                <div className="metric-strip flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Output
                  </span>
                  <span className="mono-number text-sm font-bold text-[color:var(--ink-0)]">
                    JSON + Markdown reports
                  </span>
                </div>
                <div className="metric-strip flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    AI Layer
                  </span>
                  <span className="mono-number text-sm font-bold text-[color:var(--ink-0)]">
                    Gemini fairness assessment
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="mt-8 grid gap-5 lg:grid-cols-3">
          {capabilities.map((item) => {
            const Icon = item.icon;

            return (
              <article key={item.title} className="surface shell-tight px-5 py-5 md:px-6 md:py-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1.5">
                  <Icon className="h-4 w-4 text-[color:var(--signal)]" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    Core Capability
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-[color:var(--ink-0)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">{item.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="surface shell px-6 py-6 md:px-7 md:py-7">
            <p className="section-kicker">Workflow</p>
            <h3 className="display-title mt-2 text-3xl font-black text-[color:var(--ink-0)]">
              From raw data to defensible decisions
            </h3>
            <ol className="mt-5 space-y-3">
              {flow.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mono-number mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--line)] bg-white/75 text-xs font-bold text-[color:var(--ink-1)]">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-[color:var(--ink-1)]">{step}</span>
                </li>
              ))}
            </ol>
          </article>

          <article className="surface shell px-6 py-6 md:px-7 md:py-7">
            <p className="section-kicker">UN SDG Alignment</p>
            <h3 className="display-title mt-2 text-3xl font-black text-[color:var(--ink-0)]">
              Responsible AI for social impact
            </h3>

            <div className="mt-4 space-y-2">
              <div className="metric-strip flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold text-[color:var(--ink-1)]">SDG 5 Gender Equality</span>
                <span className="pill">Hiring fairness</span>
              </div>
              <div className="metric-strip flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold text-[color:var(--ink-1)]">SDG 10 Reduced Inequalities</span>
                <span className="pill">Loan + healthcare equity</span>
              </div>
              <div className="metric-strip flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold text-[color:var(--ink-1)]">SDG 16 Strong Institutions</span>
                <span className="pill">Transparent automation</span>
              </div>
            </div>

            <Link
              href="/studio"
              className="btn-primary mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm"
            >
              Launch Studio
              <Sparkles className="h-4 w-4" />
            </Link>
          </article>
        </section>

        <section className="mt-8 surface shell overflow-hidden px-6 py-5 md:px-8 md:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="section-kicker">Demo Ready</p>
              <p className="mt-1 text-sm text-[color:var(--muted)] md:text-base">
                Challenge templates and one-click scenario loading are built in for live hackathon demos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="pill">
                <FlaskConical className="mr-1.5 inline h-3.5 w-3.5" />
                Demo datasets
              </span>
              <span className="pill">
                <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
                Mitigation plans
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}