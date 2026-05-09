"use client";

import { useSearchParams } from "next/navigation";
import { monthLabel } from "../../lib/formatters";

function clampYear(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 2000 || value > fallback) return fallback;
  return value;
}

function clampMonth(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 12) return fallback;
  return value;
}

function countBusinessDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekDay = new Date(year, month - 1, day).getDay();
    if (weekDay >= 1 && weekDay <= 5) count += 1;
  }
  return count;
}

function countBusinessDaysElapsedInMonth(year: number, month: number, dayLimit: number): number {
  let count = 0;
  for (let day = 1; day <= dayLimit; day += 1) {
    const weekDay = new Date(year, month - 1, day).getDay();
    if (weekDay >= 1 && weekDay <= 5) count += 1;
  }
  return count;
}

export function DashboardBusinessDaysBadge() {
  const searchParams = useSearchParams();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const rawYear = Number(searchParams.get("year"));
  const rawMonth = Number(searchParams.get("month"));
  const selectedYear = clampYear(rawYear, currentYear);
  let selectedMonth = clampMonth(rawMonth, currentMonth);
  if (selectedYear === currentYear && selectedMonth > currentMonth) {
    selectedMonth = currentMonth;
  }

  const totalBusinessDays = countBusinessDaysInMonth(selectedYear, selectedMonth);
  const isCurrentPeriod = selectedYear === currentYear && selectedMonth === currentMonth;
  const isPastPeriod =
    selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth);
  const elapsedBusinessDays = isCurrentPeriod
    ? countBusinessDaysElapsedInMonth(selectedYear, selectedMonth, now.getDate())
    : isPastPeriod
      ? totalBusinessDays
      : 0;
  const remainingBusinessDays = Math.max(totalBusinessDays - elapsedBusinessDays, 0);

  return (
    <div className="hidden items-center gap-2 rounded-md border border-cyan-500/35 bg-cyan-950/20 px-3 py-1.5 text-[11px] text-cyan-100 lg:inline-flex">
      <span className="font-semibold tracking-wide">
        Dias úteis {monthLabel(selectedMonth)}/{selectedYear}
      </span>
      <span className="text-cyan-300/80">•</span>
      <span>
        Total: <span className="font-semibold text-cyan-200">{totalBusinessDays}</span>
      </span>
      <span className="text-cyan-300/80">•</span>
      <span>
        Restantes: <span className="font-semibold text-cyan-200">{remainingBusinessDays}</span>
      </span>
    </div>
  );
}
