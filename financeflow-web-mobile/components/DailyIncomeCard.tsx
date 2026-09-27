"use client";

// Mesmo card "Ganho por dia útil" do Dashboard desktop, em layout de lista para telas pequenas.
import { useState } from "react";
import { DailyIncomePayload, DailyIncomePoint } from "@/types";
import { formatCurrency, formatPct, monthLabel } from "@/lib/format";

type Mode = "daily" | "per10k";

// Mesmas cores por instituição da tabela do Dashboard (texto e barra).
const INSTITUTION_COLORS: Array<{ match: string; text: string; bar: string }> = [
  { match: "Itaú", text: "text-amber-300", bar: "bg-amber-300" },
  { match: "Santander", text: "text-rose-300", bar: "bg-rose-300" },
  { match: "Nubank", text: "text-violet-300", bar: "bg-violet-300" },
  { match: "XP", text: "text-sky-300", bar: "bg-sky-300" },
  { match: "Banco do Brasil", text: "text-blue-300", bar: "bg-blue-300" },
  { match: "Inter", text: "text-orange-300", bar: "bg-orange-300" },
  { match: "BTG Pactual", text: "text-cyan-300", bar: "bg-cyan-300" },
];

function colorsFor(label: string): { text: string; bar: string } {
  return INSTITUTION_COLORS.find((item) => label.includes(item.match)) ?? { text: "text-amber-300", bar: "bg-amber-300" };
}

function toneClass(value: number | null): string {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-slate-400";
}

function signedPct(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "▲" : value < 0 ? "▼" : "•"} ${formatPct(value)}`;
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function DailyIncomeCard({ data }: { data: DailyIncomePayload | null }) {
  const [mode, setMode] = useState<Mode>("daily");

  if (!data) {
    return (
      <section className="card">
        <h2 className="text-sm font-semibold text-slate-100">Ganho por dia útil</h2>
        <p className="mt-2 text-xs text-rose-300">Não foi possível carregar o ganho por dia útil.</p>
      </section>
    );
  }

  const valueOf = (point: DailyIncomePoint | null) =>
    point === null ? null : mode === "daily" ? point.dailyIncome : point.dailyPer10k;
  const changeOf = (point: DailyIncomePoint | null) =>
    point === null ? null : mode === "daily" ? point.changePercent : point.changePer10kPercent;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Ganho por dia útil — {data.year}</h2>
          <p className="text-xs text-slate-400">
            {mode === "daily"
              ? "Renda de cada CDB no mês ÷ dias úteis em que ele rendeu."
              : "A cada R$ 10 mil aplicados: mostra a taxa, sem o efeito dos aportes."}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setMode("daily")}
            className={`rounded-md px-2.5 py-1 ${mode === "daily" ? "bg-indigo-500 text-white" : "text-slate-300"}`}
          >
            R$/dia útil
          </button>
          <button
            type="button"
            onClick={() => setMode("per10k")}
            className={`rounded-md px-2.5 py-1 ${mode === "per10k" ? "bg-indigo-500 text-white" : "text-slate-300"}`}
          >
            Por R$ 10 mil
          </button>
        </div>
      </div>

      {data.series.length === 0 ? (
        <p className="text-xs text-slate-400">Sem CDBs com renda lançada em {data.year}.</p>
      ) : (
        <div className="space-y-4">
          {data.series.map((item) => {
            const colors = colorsFor(item.label);
            const values = item.points.map(valueOf);
            const max = Math.max(0, ...values.map((value) => value ?? 0));
            const latestIndex = values.reduce<number>((acc, value, index) => (value !== null ? index : acc), -1);
            const latest = latestIndex >= 0 ? item.points[latestIndex] : null;
            const yearChange = mode === "daily" ? item.yearChangePercent : item.yearChangePer10kPercent;
            return (
              <article key={item.investmentId} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${colors.text}`}>{item.label}</p>
                    <p className="text-[11px] text-slate-500">
                      No ano:{" "}
                      <span className={`font-semibold ${toneClass(yearChange)}`}>{signedPct(yearChange)}</span>
                      {item.fromMonth && item.toMonth
                        ? ` (${monthLabel(item.fromMonth).toLowerCase()} → ${monthLabel(item.toMonth).toLowerCase()})`
                        : ""}
                    </p>
                  </div>
                  {latest ? (
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-50">{formatCurrency(valueOf(latest))}</p>
                      <p className="text-[11px] text-slate-500">
                        {monthLabel(latest.month)}
                        {latest.status === "in_progress" ? " (parcial)" : ""}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex h-16 items-end gap-1">
                  {item.points.map((point, index) => {
                    const value = values[index];
                    const muted = point?.status === "in_progress" || point?.partialDebut;
                    return (
                      <div key={data.months[index]} className="flex h-full flex-1 flex-col justify-end">
                        {value !== null && max > 0 ? (
                          <div
                            className={`w-full rounded-t ${colors.bar} ${muted ? "opacity-40" : "opacity-90"}`}
                            style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
                          />
                        ) : (
                          <div className="h-0.5 w-full rounded bg-slate-700" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex gap-1">
                  {data.months.map((month) => (
                    <span key={month} className="flex-1 text-center text-[9px] uppercase text-slate-500">
                      {monthLabel(month).slice(0, 1)}
                    </span>
                  ))}
                </div>

                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                  {item.points.map((point, index) =>
                    point === null ? null : (
                      <div
                        key={data.months[index]}
                        className="min-w-[88px] shrink-0 rounded-lg border border-slate-700/80 bg-slate-950/40 px-2 py-1.5"
                      >
                        <p className="text-[10px] uppercase text-slate-500">
                          {monthLabel(point.month)}
                          {point.status === "in_progress" ? "*" : ""}
                        </p>
                        <p className="text-xs font-semibold text-slate-100">{formatCurrency(valueOf(point))}</p>
                        <p className={`text-[10px] ${toneClass(changeOf(point))}`}>
                          {point.partialDebut ? <span className="text-slate-500">estreia</span> : signedPct(changeOf(point))}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </article>
            );
          })}

          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              {mode === "daily" ? "Carteira" : "Carteira (média)"}
            </span>
            {(() => {
              const latest = [...data.total].reverse().find((item) => item !== null) ?? null;
              if (!latest) return <span className="text-sm text-slate-500">—</span>;
              const value = mode === "daily" ? latest.dailyIncome : latest.dailyPer10k;
              return (
                <span className="text-right">
                  <span className="block text-sm font-bold text-slate-50">{formatCurrency(value)}</span>
                  <span className="block text-[11px] text-slate-500">
                    {monthLabel(latest.month)}
                    {latest.status === "in_progress" ? " (parcial)" : ""}
                  </span>
                </span>
              );
            })()}
          </div>

          <p className="text-[11px] text-slate-500">
            * Mês em andamento: só os dias úteis com dados (até {formatDateBR(data.dataThroughISO)}). Estreia sem data de
            início no cadastro fica fora das variações. FIIs ficam de fora: dividendos são mensais.
          </p>
        </div>
      )}
    </section>
  );
}
