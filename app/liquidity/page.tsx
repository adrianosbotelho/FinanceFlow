import { LiquidityPageClient } from "../../components/liquidity/LiquidityPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LiquidityPage() {
  return <LiquidityPageClient />;
}
