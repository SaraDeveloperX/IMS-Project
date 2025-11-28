"use client";

import OperatorAnalytics from "@/components/OperatorAnalytics";
import DailyRiskReportButton from "@/components/DailyRiskReport";

export default function OperatorAnalyticsPage() {
  return (
    <main className="min-h-[calc(100vh-5rem)] py-3">
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white/95 tracking-tight">
            Operator Analytics Console
          </h1>
          <p className="mt-1 text-sm text-white/70 max-w-xl">
            Centralised analytics for live AIS traffic and model-classified events over the last 60 minutes.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-emerald-100">
              Model-classified events
            </span>
            <span className="rounded-full border border-sky-300/40 bg-sky-300/10 px-3 py-1 text-sky-100">
              Live AIS metrics
            </span>
            <span className="rounded-full border border-white/25 bg-white/5 px-3 py-1 text-white/80">
              Analysis window: 60 minutes
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          <DailyRiskReportButton />
          <p className="text-[11px] text-white/60 max-w-xs text-left md:text-right">
            Generates a consolidated daily risk report combining model classifications and AIS indicators for use in shift handover records.
          </p>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1.4fr)] items-start">
        <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.03] shadow-[0_16px_45px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white/90 tracking-wide">
                Operational metrics
              </h2>
              <p className="text-[11px] text-white/65 mt-0.5">
                Near real-time indicators derived from live AIS updates and model classifications.
              </p>
            </div>
            <div className="hidden md:flex flex-col items-end text-[11px] text-white/60">
              <span>Data sources: AIS + model</span>
              <span className="mt-0.5">Update interval: ~60 seconds</span>
            </div>
          </div>

          <div className="px-3 pb-3 pt-2">
            <OperatorAnalytics />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-slate-900/60 to-slate-900/20 shadow-[0_12px_40px_rgba(0,0,0,0.5)] p-4">
            <h3 className="text-sm font-semibold text-white/90 mb-1.5">
              Operational insight
            </h3>
            <p className="text-[12px] text-white/65 mb-3">
              Summary view of vessel movement, speed behaviour, and model-classified event patterns within the monitored area.
            </p>

            <ul className="space-y-1.5 text-[12px] text-white/75">
              <li className="flex gap-2">
                <span className="mt-[3px] h-[6px] w-[6px] rounded-full bg-emerald-300" />
                <span>
                  <span className="font-semibold text-emerald-200">Speeding ratio:</span>{" "}
                  percentage of tracked vessels operating above the configured speed threshold.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] h-[6px] w-[6px] rounded-full bg-amber-300" />
                <span>
                  <span className="font-semibold text-amber-200">Event trend:</span>{" "}
                  time-series pattern of model-classified events within the current analysis window.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] h-[6px] w-[6px] rounded-full bg-sky-300" />
                <span>
                  <span className="font-semibold text-sky-200">Speed distribution:</span>{" "}
                  current distribution of vessel speeds across the monitored footprint.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-white/8 to-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white/90 mb-1.5">
              Operator playbook
            </h3>
            <p className="text-[12px] text-white/65 mb-3">
              Reference actions for reviewing model-classified anomalies.
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-[12px] text-white/75">
              <li>
                When event frequency increases, review vessels associated with proximity risk,
                restricted-area movement, or abnormal speed patterns.
              </li>
              <li>
                Use the “Top-10 fastest vessels” view to identify units requiring verification
                or course adjustment in line with standard operating procedures.
              </li>
              <li>
                At the end of each shift, generate the Daily Risk Report and attach it to
                the formal handover documentation.
              </li>
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
