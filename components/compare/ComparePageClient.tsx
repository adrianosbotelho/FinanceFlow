"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Investment, MarketReferencePayload } from "../../types";
import { MarketAssumptions, OFFER_KINDS, Offer, OfferKind, compareOffers } from "../../lib/compare-offers";
import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";
import { Card } from "../ui/Card";

const STORAGE_KEY = "financeflow.compare.offers.v1";
const INPUT_CLASS =
  "rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const TERM_PRESETS = [90, 180, 365, 540, 720, 1080];
const TOOLTIP_STYLE = { backgroundColor: "#020617", borderColor: "#1f2937" };

// Ofertas de referência para começar; o usuário ajusta as taxas às ofertas reais que encontrar.
const REFERENCE_OFFERS: Offer[] = [
  { id: "ref-lci", label: "LCI/LCA (exemplo)", kind: "LCI_LCA_POS", rate: 90 },
  { id: "ref-tesouro-selic", label: "Tesouro Selic", kind: "TESOURO_SELIC", rate: 0.1 },
  { id: "ref-tesouro-ipca", label: "Tesouro IPCA+ (exemplo)", kind: "TESOURO_IPCA", rate: 6 },
  { id: "ref-cdb-pre", label: "CDB prefixado (exemplo)", kind: "CDB_PRE", rate: 13 },
  { id: "ref-poupanca", label: "Poupança", kind: "POUPANCA", rate: 0 },
];

function parseNumber(value: string): number {
  const text = value.trim();
  const parsed = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readStoredOffers(): Offer[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Offer[]) : null;
    return Array.isArray(parsed) && parsed.every((item) => item && item.kind in OFFER_KINDS) ? parsed : null;
  } catch {
    return null;
  }
}

function storeOffers(offers: Offer[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
  } catch {
    // Armazenamento indisponível: as ofertas valem só para esta sessão.
  }
}

export function ComparePageClient() {
  const [market, setMarket] = useState<MarketAssumptions | null>(null);
  const [marketSource, setMarketSource] = useState<MarketReferencePayload | null>(null);
  const [amountText, setAmountText] = useState("10.000,00");
  const [days, setDays] = useState(365);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [portfolioIds, setPortfolioIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [marketRes, invRes] = await Promise.all([
          fetch("/api/market/reference", { cache: "no-store" }),
          fetch("/api/investments", { cache: "no-store" }),
        ]);
        const reference = (await marketRes.json()) as MarketReferencePayload;
        setMarketSource(reference);
        setMarket({ cdiAnnual: reference.cdiAnnual, selicAnnual: reference.selicAnnual, ipcaAnnual: reference.ipca12m });

        const investments: Investment[] = invRes.ok ? await invRes.json() : [];
        // Investimentos atuais entram como ofertas para comparar com as alternativas.
        const portfolio: Offer[] = investments
          .filter((inv) => inv.type === "CDB" && Number(inv.amount_invested) > 0)
          .map((inv) => ({
            id: `carteira-${inv.id}`,
            label: `${inv.name} (sua carteira)`,
            kind: "CDB_POS" as OfferKind,
            rate: Number(inv.cdi_rate ?? 100) || 100,
          }));
        setPortfolioIds(new Set(portfolio.map((offer) => offer.id)));
        const stored = readStoredOffers();
        const custom = stored ? stored.filter((offer) => !offer.id.startsWith("carteira-")) : REFERENCE_OFFERS;
        setOffers([...portfolio, ...custom]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar referências de mercado.");
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (offers.length > 0) storeOffers(offers.filter((offer) => !portfolioIds.has(offer.id)));
  }, [offers, portfolioIds]);

  const amount = parseNumber(amountText);
  const ranking = useMemo(
    () => (market && amount > 0 && days > 0 ? compareOffers(offers, market, amount, days) : []),
    [offers, market, amount, days],
  );
  const best = ranking[0] ?? null;
  const bestPortfolio = ranking.find((item) => portfolioIds.has(item.offer.id)) ?? null;

  const updateOffer = (id: string, patch: Partial<Offer>) =>
    setOffers((prev) => prev.map((offer) => (offer.id === id ? { ...offer, ...patch } : offer)));
  const addOffer = () =>
    setOffers((prev) => [
      ...prev,
      { id: `oferta-${Date.now()}`, label: "Nova oferta", kind: "CDB_POS", rate: 100 },
    ]);
  const removeOffer = (id: string) => setOffers((prev) => prev.filter((offer) => offer.id !== id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Onde Aportar</h2>
        <p className="text-sm text-slate-400">
          Compare ofertas de renda fixa pelo valor líquido no prazo: IR regressivo, IOF, isenção de LCI/LCA e
          poupança, e custódia do Tesouro. A última coluna mostra quanto um CDB tributado precisaria render para
          empatar.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Premissas</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Valor do aporte (R$)</label>
            <input value={amountText} onChange={(e) => setAmountText(e.target.value)} className={`w-32 ${INPUT_CLASS}`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Prazo (dias corridos)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className={`w-20 ${INPUT_CLASS}`}
              />
              {TERM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDays(preset)}
                  className={`rounded-md border px-2 py-1 text-[11px] ${
                    days === preset ? "border-accent text-slate-50" : "border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {preset}d
                </button>
              ))}
            </div>
          </div>
          {market
            ? (
                [
                  ["cdiAnnual", "CDI (% a.a.)"],
                  ["selicAnnual", "Selic (% a.a.)"],
                  ["ipcaAnnual", "IPCA esperado (% a.a.)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={market[key]}
                    onChange={(e) => setMarket({ ...market, [key]: Number(e.target.value) || 0 })}
                    className={`w-24 ${INPUT_CLASS}`}
                  />
                </div>
              ))
            : null}
        </div>
        {marketSource ? (
          <p className="text-[11px] text-slate-500">
            Valores iniciais do BCB (CDI atual, meta Selic e IPCA dos últimos 12 meses)
            {Object.values(marketSource.sources).some((source) => source !== "bcb")
              ? " — algum valor veio do fallback local"
              : ""}
            . O IPCA futuro é uma premissa: ajuste para o cenário que você espera.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Ofertas</h3>
          <button
            type="button"
            onClick={addOffer}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Adicionar oferta
          </button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2">Nome</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Taxa</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const traits = OFFER_KINDS[offer.kind];
                const fromPortfolio = portfolioIds.has(offer.id);
                return (
                  <tr key={offer.id} className="border-t border-slate-800">
                    <td className="py-1.5 pr-2">
                      <input
                        value={offer.label}
                        disabled={fromPortfolio}
                        onChange={(e) => updateOffer(offer.id, { label: e.target.value })}
                        className={`w-56 ${INPUT_CLASS} disabled:opacity-70`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={offer.kind}
                        disabled={fromPortfolio}
                        onChange={(e) => updateOffer(offer.id, { kind: e.target.value as OfferKind })}
                        className={`${INPUT_CLASS} disabled:opacity-70`}
                      >
                        {(Object.keys(OFFER_KINDS) as OfferKind[]).map((kind) => (
                          <option key={kind} value={kind}>
                            {OFFER_KINDS[kind].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      {offer.kind === "POUPANCA" ? (
                        <span className="text-slate-500">regra oficial</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={offer.rate}
                            onChange={(e) => updateOffer(offer.id, { rate: Number(e.target.value) || 0 })}
                            className={`w-20 ${INPUT_CLASS}`}
                          />
                          <span className="text-slate-400">{traits.rateUnit}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {fromPortfolio ? (
                        <span className="text-[11px] text-slate-500">taxa do cadastro</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeOffer(offer.id)}
                          className="rounded-md border border-rose-800/70 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-950/40"
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {ranking.length > 0 && best ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">
            Resultado para {formatCurrencyBRL(amount)} em {days} dias
          </h3>
          <p className="mb-2 text-xs text-slate-400">
            Melhor opção: <span className="font-semibold text-emerald-300">{best.offer.label}</span> com{" "}
            {formatCurrencyBRL(best.netGain)} líquidos
            {bestPortfolio && bestPortfolio.offer.id !== best.offer.id
              ? ` — ${formatCurrencyBRL(best.netGain - bestPortfolio.netGain)} a mais que a melhor opção da sua carteira (${bestPortfolio.offer.label}).`
              : "."}
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ranking.map((item) => ({ name: item.offer.label, ganho: Number(item.netGain.toFixed(2)), id: item.offer.id }))}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis type="category" dataKey="name" width={180} stroke="#94a3b8" fontSize={10} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [formatCurrencyBRL(value), "Ganho líquido"]} />
                <Bar dataKey="ganho" radius={[0, 3, 3, 0]}>
                  {ranking.map((item) => (
                    <Cell
                      key={item.offer.id}
                      fill={item.offer.id === best.offer.id ? "#10b981" : portfolioIds.has(item.offer.id) ? "#22d3ee" : "#64748b"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2">#</th>
                  <th className="py-2">Oferta</th>
                  <th className="py-2">Taxa bruta a.a.</th>
                  <th className="py-2">Ganho bruto</th>
                  <th className="py-2">IR/IOF</th>
                  <th className="py-2">Custódia</th>
                  <th className="py-2">Ganho líquido</th>
                  <th className="py-2">Líquido a.a.</th>
                  <th className="py-2">Equivale a CDB de</th>
                  <th className="py-2">Garantia</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((item, index) => (
                  <tr
                    key={item.offer.id}
                    className={`border-t border-slate-800 ${index === 0 ? "text-emerald-200" : "text-slate-200"}`}
                  >
                    <td className="py-2 text-slate-500">{index + 1}</td>
                    <td className="py-2">
                      <p className="font-semibold">{item.offer.label}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.traits.label}
                        {item.traits.taxExempt ? " · isento de IR" : ` · IR ${formatPercentage(item.taxRatePercent)}`}
                      </p>
                    </td>
                    <td className="py-2">{formatPercentage(item.grossAnnual)}</td>
                    <td className="py-2">{formatCurrencyBRL(item.grossGain)}</td>
                    <td className="py-2 text-rose-300">{formatCurrencyBRL(item.incomeTax + item.iof)}</td>
                    <td className="py-2 text-rose-300">{item.custody > 0 ? formatCurrencyBRL(item.custody) : "—"}</td>
                    <td className="py-2 font-semibold">{formatCurrencyBRL(item.netGain)}</td>
                    <td className="py-2">{formatPercentage(item.netAnnual)}</td>
                    <td className="py-2 text-cyan-300">{item.equivalentCdbPercentOfCdi.toFixed(0)}% do CDI</td>
                    <td className="py-2 text-slate-400">{item.traits.guarantee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Simulação sem marcação a mercado: títulos prefixados e IPCA+ vendidos antes do vencimento podem render
            mais ou menos. O FGC cobre até R$ 250 mil por CPF e instituição; confira a folga na página Liquidez e
            Vencimentos e em Performance.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
