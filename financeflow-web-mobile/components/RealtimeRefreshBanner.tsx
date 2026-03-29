"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const TRACKED_TABLES = [
  "monthly_returns",
  "investments",
  "investment_goals_monthly",
  "investment_goals_annual",
  "monthly_positions",
  "investment_cash_events",
  "monthly_macro",
];

export function RealtimeRefreshBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [lastSignalAt, setLastSignalAt] = useState<number | null>(null);
  const [realtimeDisabled, setRealtimeDisabled] = useState(false);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(() => {
    if (!url || !anon || realtimeDisabled) return null;
    try {
      return createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      });
    } catch {
      return null;
    }
  }, [url, anon, realtimeDisabled]);

  useEffect(() => {
    if (!supabase) return;
    if (pathname.startsWith("/login")) return;

    try {
      const channel = supabase.channel("ff-mobile-refresh");
      for (const table of TRACKED_TABLES) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            setPendingRefresh(true);
            setLastSignalAt(Date.now());
          },
        );
      }
      channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setRealtimeDisabled(true);
        }
      });

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      setRealtimeDisabled(true);
      return;
    }
  }, [pathname, supabase]);

  if (!pendingRefresh || pathname.startsWith("/login")) return null;

  return (
    <div className="sticky top-0 z-30 -mx-1 mb-3 rounded-lg border border-amber-400/50 bg-amber-950/30 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-amber-200">Dados atualizados no desktop</p>
          <p className="text-[11px] text-amber-100/80">
            {lastSignalAt ? `Novo evento às ${new Date(lastSignalAt).toLocaleTimeString("pt-BR")}. ` : ""}
            Toque para recarregar esta página.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPendingRefresh(false);
            router.refresh();
          }}
          className="shrink-0 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300"
        >
          Atualizar agora
        </button>
      </div>
    </div>
  );
}
