"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { monthLabel } from "../../lib/formatters";

export function YearFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const minYear = 2000;
  const yearParam = Number(searchParams.get("year"));
  const yearParamIsValid =
    Number.isFinite(yearParam) &&
    Number.isInteger(yearParam) &&
    yearParam >= minYear &&
    yearParam <= currentYear;
  const selectedYear =
    yearParamIsValid ? yearParam : currentYear;

  const monthParam = Number(searchParams.get("month"));
  const selectedMonth =
    Number.isFinite(monthParam) &&
    Number.isInteger(monthParam) &&
    monthParam >= 1 &&
    monthParam <= 12
      ? monthParam
      : currentMonth;
  const year = String(selectedYear);
  const month = String(selectedMonth);
  const yearsSet = new Set(
    Array.from({ length: 8 }, (_, i) => currentYear - 7 + i),
  );
  if (selectedYear >= minYear && selectedYear <= currentYear) {
    yearsSet.add(selectedYear);
  }
  const years = Array.from(yearsSet).sort((a, b) => a - b);

  const handleChange = (value: string) => {
    const nextYear = Number(value);
    if (!Number.isInteger(nextYear) || nextYear < minYear || nextYear > currentYear) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    if (nextYear === currentYear && selectedMonth > currentMonth) {
      params.set("month", String(currentMonth));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleMonthChange = (value: string) => {
    const rawMonth = Number(value);
    if (!Number.isFinite(rawMonth) || !Number.isInteger(rawMonth) || rawMonth < 1 || rawMonth > 12) {
      return;
    }
    const normalizedMonth =
      selectedYear === currentYear && rawMonth > currentMonth ? currentMonth : rawMonth;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(normalizedMonth));
    router.push(`${pathname}?${params.toString()}`);
  };

  const moveMonth = (direction: -1 | 1) => {
    let nextYear = selectedYear;
    let nextMonth = selectedMonth + direction;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    if (
      nextYear < minYear ||
      nextYear > currentYear ||
      (nextYear === currentYear && nextMonth > currentMonth)
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    params.set("month", String(nextMonth));
    router.push(`${pathname}?${params.toString()}`);
  };

  const goToCurrentMonth = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(currentYear));
    params.set("month", String(currentMonth));
    router.push(`${pathname}?${params.toString()}`);
  };

  const isCurrentSelection = selectedYear === currentYear && selectedMonth === currentMonth;
  const nextDisabled =
    selectedYear > currentYear ||
    (selectedYear === currentYear && selectedMonth >= currentMonth);
  const analysisLabel = `${monthLabel(selectedMonth)}/${selectedYear}`;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-1 py-1 md:flex">
        <button
          type="button"
          aria-label="Mês anterior"
          title="Mês anterior"
          onClick={() => moveMonth(-1)}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          ◀
        </button>
        <span className="rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-300">
          {analysisLabel}
        </span>
        <button
          type="button"
          aria-label="Mês seguinte"
          title="Mês seguinte"
          disabled={nextDisabled}
          onClick={() => moveMonth(1)}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ▶
        </button>
        {!isCurrentSelection && (
          <button
            type="button"
            onClick={goToCurrentMonth}
            className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20"
          >
            Atual
          </button>
        )}
      </div>

      <select
        aria-label="Selecionar mês de análise"
        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 shadow-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent md:text-sm"
        value={month}
        onChange={(e) => handleMonthChange(e.target.value)}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
          <option
            key={value}
            value={String(value)}
            disabled={selectedYear === currentYear && value > currentMonth}
          >
            {monthLabel(value)}
          </option>
        ))}
      </select>
      <select
        aria-label="Selecionar ano de análise"
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 shadow-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent md:text-sm"
        value={year}
        onChange={(e) => handleChange(e.target.value)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
