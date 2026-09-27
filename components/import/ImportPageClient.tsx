"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ImportCommitPayload,
  ImportFormat,
  ImportKind,
  ImportPreviewPayload,
  ImportPreviewRow,
  Investment,
} from "../../types";
import { formatCurrencyBRL, monthLabel } from "../../lib/formatters";
import { publishDataSyncUpdate } from "../../lib/client-data-sync";
import { Card } from "../ui/Card";

const INPUT_CLASS =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent";

// Modelos com dados fictícios; o usuário troca pelos nomes cadastrados em Investimentos.
const TEMPLATES: Record<ImportKind, { fileName: string; content: string }> = {
  returns: {
    fileName: "modelo-rendimentos.csv",
    content: "investimento;ano;mes;rendimento\nNome do investimento;2025;1;123,45\nNome do investimento;2025;2;130,00\n",
  },
  cash_events: {
    fileName: "modelo-aportes-resgates.csv",
    content: "data;investimento;tipo;valor\n10/01/2025;Nome do investimento;aporte;1.000,00\n15/03/2025;Nome do investimento;resgate;500,00\n",
  },
};

const STATUS_BADGES: Record<ImportPreviewRow["status"], { label: string; className: string }> = {
  novo: { label: "Novo", className: "border-emerald-700 text-emerald-300" },
  atualiza: { label: "Atualiza", className: "border-cyan-700 text-cyan-300" },
  igual: { label: "Já lançado", className: "border-slate-700 text-slate-400" },
  duplicado: { label: "Duplicado", className: "border-slate-700 text-slate-400" },
  fechado: { label: "Mês fechado", className: "border-amber-700 text-amber-300" },
  erro: { label: "Erro", className: "border-rose-700 text-rose-300" },
  ignorado: { label: "Ignorado", className: "border-slate-700 text-slate-500" },
};

async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  // Extratos antigos (OFX/CSV) costumam vir em Windows-1252.
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

function downloadTemplate(kind: ImportKind) {
  const template = TEMPLATES[kind];
  const blob = new Blob(["﻿", template.content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = template.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ImportPageClient() {
  const [kind, setKind] = useState<ImportKind>("returns");
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investmentId, setInvestmentId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<ImportFormat>("csv");
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adjustBalance, setAdjustBalance] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitPayload | null>(null);

  useEffect(() => {
    void fetch("/api/investments", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Investment[]) => {
        setInvestments(Array.isArray(data) ? data : []);
        const firstCdb = (Array.isArray(data) ? data : []).find((inv) => inv.type === "CDB");
        if (firstCdb) setInvestmentId(firstCdb.id);
      })
      .catch(() => setInvestments([]));
  }, []);

  const resetPreview = () => {
    setPreview(null);
    setSelected(new Set());
    setResult(null);
    setError(null);
  };

  const handleFile = async (file: File | null) => {
    resetPreview();
    if (!file) {
      setFileName(null);
      setContent("");
      return;
    }
    setFileName(file.name);
    setFormat(file.name.toLowerCase().endsWith(".ofx") ? "ofx" : "csv");
    setContent(await readFileText(file));
  };

  const requestBody = () => ({ kind, format, content, investment_id: format === "ofx" ? investmentId : null });

  const handlePreview = async () => {
    if (!content) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Erro ao ler o arquivo.");
      const data = payload as ImportPreviewPayload;
      setPreview(data);
      setSelected(new Set(data.rows.filter((row) => row.importable).map((row) => row.line)));
      setError(data.error);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Erro ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (selected.size === 0) return;
    const what = kind === "returns" ? "rendimento(s)" : "evento(s) de caixa";
    if (!window.confirm(`Importar ${selected.size} ${what}?${adjustBalance ? " O saldo dos investimentos será ajustado." : ""}`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody(), lines: Array.from(selected), adjust_balance: adjustBalance }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Erro ao gravar a importação.");
      setResult(payload as ImportCommitPayload);
      publishDataSyncUpdate(kind === "returns" ? "returns" : "investments");
      await handlePreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gravar a importação.");
    } finally {
      setBusy(false);
    }
  };

  const visibleRows = useMemo(
    () => (preview?.rows ?? []).filter((row) => showIgnored || row.status !== "ignorado"),
    [preview, showIgnored],
  );
  const cdbInvestments = investments.filter((inv) => inv.type === "CDB");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Importar</h2>
        <p className="text-sm text-slate-400">
          Lançamentos em lote a partir de arquivos: rendimentos mensais (CSV) e aportes/resgates (CSV ou extrato OFX
          do banco). Nada é gravado antes da sua confirmação.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["returns", "Rendimentos mensais (CSV)"],
              ["cash_events", "Aportes e resgates (CSV ou OFX)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setKind(value);
                void handleFile(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                kind === value
                  ? "border-accent bg-accent/20 text-slate-50"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300">
          {kind === "returns" ? (
            <p>
              CSV com as colunas <code className="text-cyan-300">investimento;ano;mes;rendimento</code> (ou{" "}
              <code className="text-cyan-300">investimento;competencia;rendimento</code>, com competência mm/aaaa). O
              rendimento é o total do mês. Meses já lançados com outro valor são atualizados e entram na trilha de
              auditoria.
            </p>
          ) : (
            <p>
              CSV com as colunas <code className="text-cyan-300">data;investimento;tipo;valor</code> (tipo: aporte,
              resgate, imposto ou taxa), ou o extrato <strong>OFX</strong> da conta corrente: saídas com termos de
              aplicação viram aportes e entradas de resgate/vencimento viram resgates, no investimento escolhido.
            </p>
          )}
          <p className="mt-1 text-slate-400">
            O investimento é identificado pelo nome cadastrado (ou &quot;nome (instituição)&quot;). Valores aceitam 1.234,56 ou
            1234.56; datas aceitam dd/mm/aaaa ou aaaa-mm-dd.
          </p>
          <button
            type="button"
            onClick={() => downloadTemplate(kind)}
            className="mt-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
          >
            Baixar modelo CSV
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Arquivo</label>
            <input
              type="file"
              accept={kind === "returns" ? ".csv,.txt" : ".csv,.txt,.ofx"}
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-300 file:mr-3 file:rounded-md file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:text-slate-100"
            />
          </div>
          {kind === "cash_events" && format === "ofx" ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Investimento que recebe os eventos do extrato</label>
              <select value={investmentId} onChange={(e) => setInvestmentId(e.target.value)} className={INPUT_CLASS}>
                {cdbInvestments.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} ({inv.institution})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!content || busy}
            onClick={() => void handlePreview()}
            className="inline-flex h-8 items-center rounded-lg bg-accent px-4 text-xs font-medium text-white hover:bg-accent-soft disabled:opacity-50"
          >
            {busy && !preview ? "Lendo..." : "Pré-visualizar"}
          </button>
        </div>

        {kind === "cash_events" ? (
          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={adjustBalance}
              onChange={(e) => setAdjustBalance(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Somar aportes e subtrair resgates do saldo do investimento.{" "}
              <span className="text-amber-300">
                Deixe desmarcado para lançar histórico: o saldo cadastrado já contém esses valores.
              </span>
            </span>
          </label>
        ) : null}
        {fileName ? <p className="text-[11px] text-slate-500">Arquivo: {fileName} ({format.toUpperCase()})</p> : null}
      </Card>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {result ? (
        <Card className="border-emerald-800/60">
          <p className="text-sm text-emerald-300">
            Importação concluída: {result.created} novo(s), {result.updated} atualizado(s)
            {result.skipped > 0 ? `, ${result.skipped} ignorado(s) na revalidação` : ""}
            {result.balanceAdjusted ? "; saldo dos investimentos ajustado" : ""}.
          </p>
        </Card>
      ) : null}

      {preview && preview.rows.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Prévia</h3>
              <p className="text-xs text-slate-400">
                {Object.entries(preview.counts)
                  .filter(([, count]) => count > 0)
                  .map(([status, count]) => `${count} ${STATUS_BADGES[status as ImportPreviewRow["status"]].label.toLowerCase()}`)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {preview.counts.ignorado > 0 ? (
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  <input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />
                  Mostrar transações ignoradas
                </label>
              ) : null}
              <button
                type="button"
                disabled={selected.size === 0 || busy}
                onClick={() => void handleCommit()}
                className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-4 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Importando..." : `Importar ${selected.size} linha(s)`}
              </button>
            </div>
          </div>
          <div className="mt-3 max-h-[480px] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>
                  <th className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas"
                      checked={preview.rows.filter((row) => row.importable).every((row) => selected.has(row.line))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(preview.rows.filter((row) => row.importable).map((row) => row.line))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="py-2">Linha</th>
                  <th className="py-2">Investimento</th>
                  <th className="py-2">{kind === "returns" ? "Competência" : "Data"}</th>
                  {kind === "cash_events" ? <th className="py-2">Tipo</th> : null}
                  <th className="py-2">Valor</th>
                  {kind === "returns" ? <th className="py-2">Valor atual</th> : <th className="py-2">Descrição</th>}
                  <th className="py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const badge = STATUS_BADGES[row.status];
                  return (
                    <tr key={row.line} className="border-t border-slate-800 text-slate-200">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          disabled={!row.importable}
                          checked={selected.has(row.line)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(row.line);
                            else next.delete(row.line);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="py-1.5 text-slate-500">{row.line}</td>
                      <td className="py-1.5">{row.investmentLabel}</td>
                      <td className="py-1.5">
                        {kind === "returns"
                          ? row.month && row.year
                            ? `${monthLabel(row.month)}/${row.year}`
                            : "—"
                          : row.date
                            ? row.date.split("-").reverse().join("/")
                            : "—"}
                      </td>
                      {kind === "cash_events" ? <td className="py-1.5">{row.type ?? "—"}</td> : null}
                      <td className="py-1.5 font-semibold">{row.value === null ? "—" : formatCurrencyBRL(row.value)}</td>
                      {kind === "returns" ? (
                        <td className="py-1.5 text-slate-400">
                          {row.previousValue === null ? "—" : formatCurrencyBRL(row.previousValue)}
                        </td>
                      ) : (
                        <td className="max-w-[240px] truncate py-1.5 text-slate-400" title={row.description ?? ""}>
                          {row.description || "—"}
                        </td>
                      )}
                      <td className="py-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                        {row.message ? <span className="ml-2 text-[11px] text-slate-500">{row.message}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
