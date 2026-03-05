import { Suspense } from "react";
import { YearFilter } from "../ui/YearFilter";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-background/80 px-4 py-3 backdrop-blur md:px-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-50 md:text-xl">
          Painel de Renda Passiva
        </h1>
        <p className="text-xs text-slate-400 md:text-sm">
          Acompanhe seus CDBs e FIIs com métricas profissionais.
        </p>
      </div>
      <Suspense fallback={<div className="h-8 w-24 rounded bg-slate-800" />}>
        <YearFilter />
      </Suspense>
    </header>
  );
}
