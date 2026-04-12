import { Suspense } from "react";
import { YearFilter } from "../ui/YearFilter";
import { ProfessionalAlertsBadge } from "./ProfessionalAlertsBadge";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-md md:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
          <span className="text-sm font-semibold">FF</span>
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-50 md:text-xl">
            FinanceFlow
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">Wealth Performance</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Suspense fallback={<div className="h-8 w-24 rounded bg-slate-800" />}>
          <ProfessionalAlertsBadge />
        </Suspense>
        <Suspense fallback={<div className="h-8 w-44 rounded bg-slate-800" />}>
          <YearFilter />
        </Suspense>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-xs font-semibold text-accent">
          P
        </div>
      </div>
    </header>
  );
}
