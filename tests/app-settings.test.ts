import { describe, expect, it } from "vitest";
import {
  defaultAppSettings,
  isAppSettingKey,
  netIncomeFromGross,
  resolveAppSettings,
  validateAppSettingValue,
} from "../lib/app-settings";

describe("app-settings", () => {
  it("padrões quando não há nada salvo", () => {
    expect(resolveAppSettings([])).toEqual(defaultAppSettings());
    expect(defaultAppSettings().net_income_discount_percent).toBe(15);
  });

  it("usa o valor salvo e ignora chaves desconhecidas ou fora dos limites", () => {
    expect(resolveAppSettings([{ key: "net_income_discount_percent", value: "17.5" }]).net_income_discount_percent).toBe(17.5);
    expect(resolveAppSettings([{ key: "net_income_discount_percent", value: 140 }]).net_income_discount_percent).toBe(15);
    expect(resolveAppSettings([{ key: "outra", value: 1 }])).toEqual(defaultAppSettings());
    expect(isAppSettingKey("outra")).toBe(false);
  });

  it("valida número e limites, arredondando às casas aceitas", () => {
    expect(validateAppSettingValue("net_income_discount_percent", 22.456)).toEqual({ ok: true, value: 22.46 });
    expect(validateAppSettingValue("net_income_discount_percent", "abc").ok).toBe(false);
    expect(validateAppSettingValue("net_income_discount_percent", -1).ok).toBe(false);
    expect(validateAppSettingValue("net_income_discount_percent", 0)).toEqual({ ok: true, value: 0 });
  });

  it("rendimento líquido = bruto × (1 − desconto)", () => {
    expect(netIncomeFromGross(1000, 15)).toBeCloseTo(850, 6);
    expect(netIncomeFromGross(1000, 0)).toBe(1000);
    expect(netIncomeFromGross(0, 15)).toBe(0);
    expect(netIncomeFromGross(-50, 15)).toBe(-50);
  });
});
