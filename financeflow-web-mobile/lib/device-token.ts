// Cookie de "aparelho confiável": depois do código de verificação, o aparelho recebe um token assinado
// (id do aparelho + validade). Funções puras para gerar e conferir o token; o registro (e a revogação)
// de cada aparelho fica em lib/trusted-devices.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEVICE_COOKIE_NAME = "ff_device";
export const DEVICE_TRUST_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function signature(deviceId: string, exp: number, secret: string): string {
  return createHmac("sha256", `${secret}:trusted-device`).update(`${deviceId}.${exp}`).digest("base64url");
}

export function createDeviceToken(deviceId: string, secret: string, nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + DEVICE_TRUST_MAX_AGE_SECONDS;
  return `${deviceId}.${exp}.${signature(deviceId, exp, secret)}`;
}

/** Devolve o id do aparelho se o token tiver assinatura válida e não estiver vencido. */
export function readDeviceToken(token: string | null | undefined, secret: string, nowMs: number): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [deviceId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!/^[0-9a-f-]{36}$/.test(deviceId) || !Number.isInteger(exp)) return null;
  const expected = Buffer.from(signature(deviceId, exp, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (exp <= Math.floor(nowMs / 1000)) return null;
  return deviceId;
}

/** Nome legível do aparelho a partir do User-Agent (só para a lista de aparelhos). */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Aparelho desconhecido";
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS|Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  return browser ? `${device} · ${browser}` : device;
}
