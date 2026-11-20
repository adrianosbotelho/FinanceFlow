#!/usr/bin/env node
// Gera a chave da verificação em duas etapas (TOTP) do login do mobile.
// Uso: npm run totp:setup -- seu-email@exemplo.com
// 1. Cadastre a chave no app autenticador (Senhas do iPhone: Ajustes > Senhas > item do FinanceFlow >
//    "Configurar código de verificação" > "Inserir chave de configuração"), ou abra o link otpauth:// no iPhone.
// 2. Defina AUTH_TOTP_SECRET com a chave na Vercel (Production) e faça um novo deploy.
// A chave é secreta: não a cole em issues, PRs ou mensagens.
import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

const account = process.argv[2] ?? "login";
const secret = base32(randomBytes(20));
const label = encodeURIComponent(`FinanceFlow:${account}`);
const uri = `otpauth://totp/${label}?secret=${secret}&issuer=FinanceFlow&algorithm=SHA1&digits=6&period=30`;

console.log("\nChave (AUTH_TOTP_SECRET):\n");
console.log(`  ${secret}`);
console.log(`\nAgrupada para digitar no app: ${secret.match(/.{1,4}/g).join(" ")}`);
console.log(`\nLink para o app autenticador:\n  ${uri}\n`);
