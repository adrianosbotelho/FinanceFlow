// Mesma rota de app/api/returns/pace/route.ts do desktop, adaptada ao cliente Supabase do mobile.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { loadMonthPace } from "@/lib/finance/month-pace";
import { isMonthClosed } from "@/lib/month-rules";
import { ReturnsPacePayload } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSaoPauloDateISO(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

// Ritmo e projeção de fechamento de um mês (mesmo cálculo do Dashboard), para a página de Retornos.
export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2000 || year > 2100 || month < 1 || month > 12) {
    return NextResponse.json({ error: "Ano ou mês inválido." }, { status: 400 });
  }
  const todayIso = getSaoPauloDateISO();
  try {
    const supabase = getSupabaseServerClient();
    const [{ pace, warnings }, closed] = await Promise.all([
      loadMonthPace(year, month, todayIso),
      isMonthClosed(supabase, year, month).catch(() => false),
    ]);
    const payload: ReturnsPacePayload = { pace, warnings, closed, today: todayIso };
    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro ao calcular o ritmo do mês." }, { status: 500 });
  }
}
