import { ReturnsClient } from "./ReturnsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ReturnsPage({ searchParams }: { searchParams?: { year?: string } }) {
  const year = Number(searchParams?.year ?? new Date().getFullYear());
  return <ReturnsClient initialYear={year} />;
}
