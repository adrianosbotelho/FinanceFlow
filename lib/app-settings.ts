// Parâmetros editáveis na página Configurações. Cada parâmetro tem padrão e limites aqui; o valor salvo
// fica na tabela app_settings (chave → valor). Funções puras, usáveis em client e server.

export type AppSettingKey = "net_income_discount_percent";

export interface AppSettingDefinition {
  key: AppSettingKey;
  label: string;
  description: string;
  /** Onde o parâmetro é usado (exibido na página). */
  usedIn: string;
  unit: "%";
  defaultValue: number;
  min: number;
  max: number;
  /** Casas decimais aceitas. */
  decimals: number;
}

export const APP_SETTING_DEFINITIONS: AppSettingDefinition[] = [
  {
    key: "net_income_discount_percent",
    label: "Desconto para o rendimento líquido",
    description:
      "Percentual descontado do rendimento bruto para chegar ao valor líquido (ex.: alíquota de IR que você espera pagar no resgate).",
    usedIn: "Performance → Detalhe mensal (coluna Rendimento líquido)",
    unit: "%",
    defaultValue: 15,
    min: 0,
    max: 100,
    decimals: 2,
  },
];

export type AppSettings = Record<AppSettingKey, number>;

const DEFINITION_BY_KEY = new Map(APP_SETTING_DEFINITIONS.map((def) => [def.key, def]));

export function isAppSettingKey(key: string): key is AppSettingKey {
  return DEFINITION_BY_KEY.has(key as AppSettingKey);
}

export function defaultAppSettings(): AppSettings {
  return Object.fromEntries(APP_SETTING_DEFINITIONS.map((def) => [def.key, def.defaultValue])) as AppSettings;
}

/** Junta as linhas salvas aos padrões; ignora chaves desconhecidas e valores fora dos limites. */
export function resolveAppSettings(rows: Array<{ key: string; value: unknown }>): AppSettings {
  const settings = defaultAppSettings();
  for (const row of rows) {
    if (!isAppSettingKey(row.key)) continue;
    const checked = validateAppSettingValue(row.key, row.value);
    if (checked.ok) settings[row.key] = checked.value;
  }
  return settings;
}

export function validateAppSettingValue(
  key: AppSettingKey,
  raw: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const def = DEFINITION_BY_KEY.get(key);
  if (!def) return { ok: false, error: "Parâmetro desconhecido." };
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${def.label}: informe um número.` };
  }
  if (value < def.min || value > def.max) {
    return { ok: false, error: `${def.label}: use um valor entre ${def.min} e ${def.max}.` };
  }
  const factor = 10 ** def.decimals;
  return { ok: true, value: Math.round(value * factor) / factor };
}

/** Rendimento líquido = bruto × (1 − desconto%). Rendimento negativo não gera desconto. */
export function netIncomeFromGross(grossIncome: number, discountPercent: number): number {
  if (grossIncome <= 0) return grossIncome;
  return grossIncome * (1 - discountPercent / 100);
}
