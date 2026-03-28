"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

function iconTone(active: boolean): string {
  return active ? "text-indigo-200" : "text-slate-300";
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-6 w-6 ${iconTone(active)}`}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function ReturnsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-6 w-6 ${iconTone(active)}`}>
      <path d="M7 4h10" />
      <path d="M7 10h10" />
      <path d="M7 16h6" />
      <circle cx="5" cy="4" r="1" />
      <circle cx="5" cy="10" r="1" />
      <circle cx="5" cy="16" r="1" />
    </svg>
  );
}

function InvestmentsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-6 w-6 ${iconTone(active)}`}>
      <path d="M4 20V9" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20v-11" />
    </svg>
  );
}

function GoalsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-6 w-6 ${iconTone(active)}`}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.6" />
    </svg>
  );
}

function HealthIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-6 w-6 ${iconTone(active)}`}>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-slate-300">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

const links = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/retornos", label: "Retornos", icon: ReturnsIcon },
  { href: "/investimentos", label: "Investimentos", icon: InvestmentsIcon },
  { href: "/metas", label: "Metas", icon: GoalsIcon },
  { href: "/health", label: "Health", icon: HealthIcon },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith("/login")) {
    return null;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/70 p-4 md:block">
        <div className="mb-5">
          <p className="text-xl font-extrabold text-slate-100">FinanceFlow Mobile</p>
          <p className="text-xs text-slate-400">Web/PWA (isolado do desktop)</p>
        </div>
        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => void logout()}
          className="mt-6 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Sair
        </button>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-6 gap-1.5 px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.95rem)]">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-[70px] items-center justify-center rounded-xl border ${
                  active
                    ? "border-indigo-500/70 bg-indigo-600/35"
                    : "border-slate-800/60 bg-slate-900/60"
                }`}
              >
                <Icon active={active} />
                <span className="sr-only">{link.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => void logout()}
            className="flex min-h-[70px] items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/60"
          >
            <LogoutIcon />
            <span className="sr-only">Sair</span>
          </button>
        </div>
      </nav>
    </>
  );
}
