"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProfessionalDiagnosticAlert } from "../../types";

type FetchState = {
  loading: boolean;
  alerts: ProfessionalDiagnosticAlert[];
};

function clampYear(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 2000 || value > fallback) return fallback;
  return value;
}

function clampMonth(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 12) return fallback;
  return value;
}

export function ProfessionalAlertsBadge() {
  const searchParams = useSearchParams();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const year = clampYear(Number(searchParams.get("year")), currentYear);
  const month = clampMonth(Number(searchParams.get("month")), currentMonth);

  const [state, setState] = useState<FetchState>({ loading: true, alerts: [] });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true }));
        const res = await fetch(`/api/insights/professional?year=${year}&month=${month}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("bad_status");
        const payload = (await res.json()) as { diagnosticAlerts?: ProfessionalDiagnosticAlert[] };
        if (cancelled) return;
        const alerts = Array.isArray(payload.diagnosticAlerts) ? payload.diagnosticAlerts : [];
        setState({ loading: false, alerts });
      } catch {
        if (!cancelled) setState({ loading: false, alerts: [] });
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [year, month]);

  const counters = useMemo(() => {
    const high = state.alerts.filter((a) => a.severity === "high").length;
    const medium = state.alerts.filter((a) => a.severity === "medium").length;
    return { high, medium, total: state.alerts.length };
  }, [state.alerts]);

  const href = `/insights?year=${year}&month=${month}`;

  if (state.loading) {
    return <div className="h-8 w-28 rounded-md border border-slate-700 bg-slate-800/70" />;
  }

  if (counters.high > 0) {
    return (
      <Link
        href={href}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-rose-700/70 bg-rose-950/40 px-2.5 text-[11px] font-semibold text-rose-100 shadow-[0_0_0_1px_rgba(225,29,72,0.2)] hover:bg-rose-950/60"
        title="Abrir Insights Financeiros para revisar alertas críticos"
      >
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white">
          {counters.high}
        </span>
        <span>Insights crítico</span>
        {counters.medium > 0 ? (
          <span className="text-[10px] text-amber-200">+{counters.medium} médios</span>
        ) : null}
      </Link>
    );
  }

  if (counters.medium > 0) {
    return (
      <Link
        href={href}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-500/50 bg-amber-900/20 px-2.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-900/30"
        title="Abrir Insights Financeiros para revisar alertas médios"
      >
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] text-slate-950">
          {counters.medium}
        </span>
        <span>Insights atenção</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-950/20 px-2.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-950/30"
      title="Abrir Insights Financeiros (monitoramento estável)"
    >
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] text-slate-950">
        ok
      </span>
      <span>Insights estável</span>
    </Link>
  );
}
