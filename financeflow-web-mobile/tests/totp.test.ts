import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, totpForCounter, totpProvisioningUri, verifyTotp } from "@/lib/totp";

// Vetores da RFC 6238 (chave ASCII "12345678901234567890", HMAC-SHA1), últimos 6 dígitos.
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("totp", () => {
  it("base32 ida e volta", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(new TextDecoder().decode(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"))).toBe("12345678901234567890");
    expect(() => base32Decode("1!")).toThrow();
  });

  it("gera os códigos da RFC 6238", () => {
    expect(totpForCounter(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpForCounter(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpForCounter(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpForCounter(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("aceita 1 passo de folga e recusa códigos errados", () => {
    const t = 1111111109 * 1000;
    expect(verifyTotp(RFC_SECRET, "081804", t)).toBe(Math.floor(1111111109 / 30));
    expect(verifyTotp(RFC_SECRET, "081804", t + 30_000)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, "081804", t + 90_000)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "000000", t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", t)).toBeNull();
  });

  it("link otpauth para o app autenticador", () => {
    const uri = totpProvisioningUri(RFC_SECRET, "pessoa@exemplo.com");
    expect(uri.startsWith("otpauth://totp/FinanceFlow%3Apessoa%40exemplo.com?")).toBe(true);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain("digits=6");
  });
});
