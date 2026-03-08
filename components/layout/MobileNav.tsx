"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DEFAULT_NAV_ITEMS,
  NAV_ORDER_STORAGE_KEY,
  NavItem,
  resolveNavItems,
} from "./navConfig";

export function MobileNav() {
  const pathname = usePathname();
  const [items, setItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);

  useEffect(() => {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as string[];
      setItems(resolveNavItems(parsed));
    } catch {
      setItems(DEFAULT_NAV_ITEMS);
    }
  }, []);

  return (
    <nav className="sticky bottom-0 z-30 flex items-center border-t border-slate-800 bg-slate-900 px-4 py-2 md:hidden">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
              active ? "text-accent" : "text-slate-400 hover:text-accent"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full border border-current" />
            <p>{item.shortLabel}</p>
          </Link>
        );
      })}
    </nav>
  );
}
