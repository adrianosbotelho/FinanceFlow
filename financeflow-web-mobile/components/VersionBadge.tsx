export function VersionBadge() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const env = process.env.VERCEL_ENV ?? "dev";
  const label = `build ${sha} • ${env}`;

  return (
    <div
      className="inline-flex items-center rounded-full border border-cyan-500/35 bg-cyan-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
      title="Versão do build em execução"
    >
      {label}
    </div>
  );
}

