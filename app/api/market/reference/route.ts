import { NextResponse } from "next/server";
import {
  resolveCdiAnnualReferenceWithSource,
  resolveLatestBcbSeriesValue,
} from "../../../../lib/cdi-reference";
import { MarketReferencePayload } from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Fallbacks usados só se o BCB estiver indisponível.
const SELIC_FALLBACK = 10.75;
const IPCA_FALLBACK = 4.5;

export async function GET() {
  const [cdi, selic, ipca] = await Promise.all([
    resolveCdiAnnualReferenceWithSource(),
    resolveLatestBcbSeriesValue(432, SELIC_FALLBACK),
    resolveLatestBcbSeriesValue(13522, IPCA_FALLBACK),
  ]);
  const payload: MarketReferencePayload = {
    cdiAnnual: cdi.value,
    selicAnnual: selic.value,
    ipca12m: ipca.value,
    sources: { cdi: cdi.source, selic: selic.source, ipca: ipca.source },
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
