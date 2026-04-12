"use client";

import { useMemo, useState } from "react";

type VersionBadgeProps = {
  sha: string;
  env: string;
  deployTimeIso: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "não informado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR");
}

export function VersionBadge({ sha, env, deployTimeIso }: VersionBadgeProps) {
  const [open, setOpen] = useState(false);
  const deployTime = useMemo(() => formatDateTime(deployTimeIso), [deployTimeIso]);
  const label = `build ${sha}`;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center rounded-full border border-cyan-500/35 bg-cyan-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
        title="Abrir detalhes da versão"
        aria-expanded={open}
      >
        {label}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-64 rounded-xl border border-cyan-500/30 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
            Build info
          </p>
          <div className="mt-2 space-y-1.5 text-xs text-slate-300">
            <p>
              <span className="text-slate-500">Commit:</span>{" "}
              <span className="font-semibold text-slate-100">{sha}</span>
            </p>
            <p>
              <span className="text-slate-500">Ambiente:</span>{" "}
              <span className="font-semibold text-slate-100">{env}</span>
            </p>
            <p>
              <span className="text-slate-500">Deploy/Build:</span>{" "}
              <span className="font-semibold text-slate-100">{deployTime}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}
