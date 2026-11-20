import { describe, expect, it } from "vitest";
import { DEVICE_TRUST_MAX_AGE_SECONDS, createDeviceToken, describeDevice, readDeviceToken } from "@/lib/device-token";

const SECRET = "segredo-de-teste";
const ID = "123e4567-e89b-12d3-a456-426614174000";
const NOW = Date.UTC(2030, 0, 1);

describe("device-token", () => {
  it("token válido devolve o id do aparelho", () => {
    expect(readDeviceToken(createDeviceToken(ID, SECRET, NOW), SECRET, NOW)).toBe(ID);
  });

  it("recusa token vencido, adulterado ou de outro segredo", () => {
    const token = createDeviceToken(ID, SECRET, NOW);
    expect(readDeviceToken(token, SECRET, NOW + (DEVICE_TRUST_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
    expect(readDeviceToken(token, "outro-segredo", NOW)).toBeNull();
    const [, exp, sig] = token.split(".");
    expect(readDeviceToken(`123e4567-e89b-12d3-a456-426614174999.${exp}.${sig}`, SECRET, NOW)).toBeNull();
    expect(readDeviceToken(`${ID}.${Number(exp) + 999}.${sig}`, SECRET, NOW)).toBeNull();
    expect(readDeviceToken("lixo", SECRET, NOW)).toBeNull();
    expect(readDeviceToken(undefined, SECRET, NOW)).toBeNull();
  });

  it("descreve o aparelho pelo User-Agent", () => {
    expect(
      describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"),
    ).toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36")).toBe("Windows · Chrome");
    expect(describeDevice(null)).toBe("Aparelho desconhecido");
  });
});
