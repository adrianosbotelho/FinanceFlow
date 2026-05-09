import { ReturnsPageClient } from "../../components/returns/ReturnsPageClient";

type SearchParams = Record<string, string | string[] | undefined>;

function toSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

interface ReturnsPageProps {
  searchParams?: SearchParams;
}

export default function ReturnsPage({ searchParams }: ReturnsPageProps) {
  const year = toInt(toSingle(searchParams?.year));
  const month = toInt(toSingle(searchParams?.month));
  return <ReturnsPageClient initialYear={year} initialMonth={month} />;
}
