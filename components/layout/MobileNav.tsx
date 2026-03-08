 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dash" },
  { href: "/performance", label: "Perf" },
  { href: "/goals", label: "Metas" },
  { href: "/investments", label: "Assets" },
  { href: "/returns", label: "Insights" },
];

export function MobileNav() {
  const pathname = usePathname();

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
            <p>{item.label}</p>
          </Link>
        );
      })}
    </nav>
  );
}
