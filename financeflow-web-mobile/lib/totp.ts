// Códigos de verificação de 6 dígitos (TOTP, RFC 6238: HMAC-SHA1, passos de 30 s), compatíveis com
// Senhas do iPhone, Google Authenticator, 1Password etc. Funções puras (node:crypto).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decodifica a chave em base32 (aceita minúsculas, espaços e "=" de preenchimento). */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const index = BASE32_ALPHABET.indexOf(clean[i]);
    if (index < 0) throw new Error("Chave base32 inválida.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Nova chave aleatória (20 bytes, padrão dos apps autenticadores). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCounter(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpForCounter(secretBase32: string, counter: number, digits = TOTP_DIGITS): string {
  const key = Buffer.from(base32Decode(secretBase32));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Confere o código aceitando 1 passo de folga para cada lado (relógio do celular adiantado/atrasado).
 * Devolve o contador aceito (para impedir reuso do mesmo código) ou null.
 */
export function verifyTotp(secretBase32: string, code: string, timeMs: number, window = 1): number | null {
  const normalized = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = totpCounter(timeMs);
  for (let delta = -window; delta <= window; delta += 1) {
    const expected = totpForCounter(secretBase32, current + delta);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return current + delta;
  }
  return null;
}

/** Link otpauth:// para cadastrar a chave num app autenticador. */
export function totpProvisioningUri(secretBase32: string, account: string, issuer = "FinanceFlow"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
