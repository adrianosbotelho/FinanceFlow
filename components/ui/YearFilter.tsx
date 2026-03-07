"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

export function YearFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const year = searchParams.get("year") ?? String(new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => currentYear - 5 + i);

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <select
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
  );
}
