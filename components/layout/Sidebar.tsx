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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [navItems, setNavItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);

  useEffect(() => {
    const saved = window.localStorage.getItem("financeflow.sidebar.collapsed");
    if (saved === "1") {
      setCollapsed(true);
    }

    const orderRaw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (orderRaw) {
      try {
        const parsed = JSON.parse(orderRaw) as string[];
        setNavItems(resolveNavItems(parsed));
      } catch {
        setNavItems(DEFAULT_NAV_ITEMS);
      }
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(
        "financeflow.sidebar.collapsed",
        next ? "1" : "0",
      );
      return next;
    });
  };

  const persistOrder = (items: NavItem[]) => {
    window.localStorage.setItem(
      NAV_ORDER_STORAGE_KEY,
      JSON.stringify(items.map((item) => item.href)),
    );
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setNavItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      persistOrder(next);
      return next;
    });
  };

  const resetOrder = () => {
    setNavItems(DEFAULT_NAV_ITEMS);
    window.localStorage.removeItem(NAV_ORDER_STORAGE_KEY);
  };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-800 bg-surface/80 px-3 py-4 md:block ${
        collapsed ? "w-20" : "w-60"
      }`}
    >
      <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-soft text-sm font-semibold text-white">
            FF
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-slate-100">FinanceFlow</p>
              <p className="text-xs text-slate-400">Passive Income</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
            aria-label="Recolher menu lateral"
            title="Recolher"
          >
            {"<"}
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mt-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
            aria-label="Expandir menu lateral"
            title="Expandir"
          >
            {">"}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOrganizing((prev) => !prev)}
            className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
            title="Organizar itens do menu"
          >
            {organizing ? "Concluir" : "Organizar"}
          </button>
          {organizing && (
            <button
              type="button"
              onClick={resetOrder}
              className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              title="Restaurar ordem padrão"
            >
              Resetar
            </button>
          )}
        </div>
      )}

      <nav className="space-y-1 text-sm">
        {navItems.map((item, index) => {
          const active = pathname === item.href;
          return (
            <div key={item.href} className="flex items-center gap-1">
              <Link
                href={item.href}
                title={item.label}
                className={`flex min-w-0 flex-1 items-center rounded-lg px-3 py-2 transition ${
                  collapsed ? "justify-center" : "gap-2"
                } ${
                  active
                    ? "bg-accent-soft/90 text-slate-50"
                    : "text-slate-300 hover:bg-slate-800 hover:text-slate-50"
                }`}
              >
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${active ? "bg-white" : "bg-slate-500"}`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
              {!collapsed && organizing && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Mover para cima"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === navItems.length - 1}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Mover para baixo"
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
