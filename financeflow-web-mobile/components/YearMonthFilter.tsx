"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthName } from "@/lib/format";

export function YearMonthFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/login") || pathname.startsWith("/health") || pathname.startsWith("/offline")) {
    return null;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const year = Number(searchParams.get("year") ?? currentYear);
  const month = Number(searchParams.get("month") ?? currentMonth);

  function navigate(newYear: number, newMonth: number) {
    const params = new URLSearchParams();
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`${pathname}?${params.toString()}`);
  }

  function prevMonth() {
    if (month === 1) navigate(year - 1, 12);
    else navigate(year, month - 1);
  }

  function nextMonth() {
    if (month === 12) navigate(year + 1, 1);
    else navigate(year, month + 1);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs">
      <button onClick={prevMonth} className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700">◀</button>
      <select
        value={month}
        onChange={(e) => navigate(year, Number(e.target.value))}
        className="rounded border-0 bg-transparent py-0 text-xs font-semibold text-slate-100 focus:ring-0"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{monthName(m)}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => navigate(Number(e.target.value), month)}
        className="rounded border-0 bg-transparent py-0 text-xs font-semibold text-slate-100 focus:ring-0"
      >
        {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button onClick={nextMonth} className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700">▶</button>
    </div>
  );
}
