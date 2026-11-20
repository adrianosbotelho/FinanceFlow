"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsCode ? { email, password, code } : { email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.requiresCode) {
          // Aparelho novo: pede o código do app autenticador sem perder e-mail e senha.
          setNeedsCode(true);
          setCode("");
        }
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <section className="card space-y-4">
        <header>
          <h1 className="text-xl font-bold text-slate-100">FinanceFlow</h1>
          <p className="text-sm text-slate-400">Login single-user para acesso ao painel web/mobile.</p>
        </header>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              autoComplete="current-password"
            />
          </div>
          {needsCode ? (
            <div>
              <label className="mb-1 block text-xs text-slate-400">Código de verificação</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-center text-lg tracking-[0.4em]"
                autoComplete="one-time-code"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                6 dígitos do app autenticador. Depois disso, este aparelho fica confiável por 180 dias.
              </p>
            </div>
          ) : null}
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {loading ? "Entrando..." : needsCode ? "Verificar e entrar" : "Entrar"}
          </button>
        </form>
      </section>
    </div>
  );
}
