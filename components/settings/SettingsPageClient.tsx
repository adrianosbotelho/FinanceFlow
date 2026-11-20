"use client";

// Página Configurações: parâmetros usados nos cálculos do app (definidos em lib/app-settings.ts).
import { useEffect, useState } from "react";
import {
  APP_SETTING_DEFINITIONS,
  AppSettingKey,
  AppSettings,
  validateAppSettingValue,
} from "../../lib/app-settings";
import { parseBrNumber } from "../../lib/import-parsers";
import { publishDataSyncUpdate } from "../../lib/client-data-sync";
import { Card } from "../ui/Card";

function toInput(value: number): string {
  return String(value).replace(".", ",");
}

export function SettingsPageClient() {
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar as configurações.");
        return body.settings as AppSettings;
      })
      .then((settings) => {
        if (cancelled) return;
        setSaved(settings);
        setDrafts(Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, toInput(value)])));
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const parsed = APP_SETTING_DEFINITIONS.map((def) => {
    const number = parseBrNumber(drafts[def.key] ?? "");
    const check = validateAppSettingValue(def.key, number ?? Number.NaN);
    return { def, check };
  });
  const invalid = parsed.find((item) => !item.check.ok);
  const changed = parsed.filter((item) => item.check.ok && saved && item.check.value !== saved[item.def.key]);

  async function save() {
    if (invalid || changed.length === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const settings = Object.fromEntries(
        changed.map((item) => [item.def.key, item.check.ok ? item.check.value : null]),
      ) as Partial<Record<AppSettingKey, number>>;
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao salvar.");
      setSaved(body.settings);
      setDrafts(Object.fromEntries(Object.entries(body.settings as AppSettings).map(([k, v]) => [k, toInput(v)])));
      setMessage("Configurações salvas.");
      publishDataSyncUpdate("settings");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Configurações</h2>
        <p className="text-sm text-slate-400">
          Parâmetros usados nos cálculos do app. Ao salvar, as telas que usam cada parâmetro passam a usar o novo
          valor.
        </p>
      </div>

      <Card>
        {loading ? <p className="text-sm text-slate-400">Carregando…</p> : null}
        {!loading ? (
          <div className="space-y-5">
            {parsed.map(({ def, check }) => (
              <div key={def.key} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px] md:items-start">
                <div>
                  <label htmlFor={def.key} className="text-sm font-semibold text-slate-100">
                    {def.label}
                  </label>
                  <p className="text-xs text-slate-400">{def.description}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Usado em: {def.usedIn} · padrão {toInput(def.defaultValue)}
                    {def.unit}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      id={def.key}
                      inputMode="decimal"
                      value={drafts[def.key] ?? ""}
                      onChange={(event) => {
                        setMessage(null);
                        setDrafts((prev) => ({ ...prev, [def.key]: event.target.value }));
                      }}
                      className={`w-full rounded-lg border bg-slate-900 px-3 py-2 text-right text-sm text-slate-100 outline-none focus:border-accent ${
                        check.ok ? "border-slate-700" : "border-rose-500"
                      }`}
                    />
                    <span className="text-sm text-slate-400">{def.unit}</span>
                  </div>
                  {!check.ok ? <p className="mt-1 text-[11px] text-rose-300">{check.error}</p> : null}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={save}
                disabled={saving || Boolean(invalid) || changed.length === 0}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
              {message ? <span className="text-sm text-emerald-300">{message}</span> : null}
              {error ? <span className="text-sm text-rose-300">{error}</span> : null}
            </div>
          </div>
        ) : null}
        {loading && error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </Card>
    </div>
  );
}
