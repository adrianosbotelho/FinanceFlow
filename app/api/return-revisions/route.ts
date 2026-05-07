import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { MonthlyReturnRevision } from "../../../types";

function isMissingTableError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

function isPermissionError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes(table.toLowerCase()) && lower.includes("permission denied");
}

function toSnapshotRevision(
  row: {
    id: string;
    investment_id: string;
    year: number;
    month: number;
    income_value: number;
    created_at?: string | null;
  },
  index: number,
): MonthlyReturnRevision {
  const income = Number(row.income_value ?? 0);
  return {
    id: `snapshot-${row.id}-${index}`,
    monthly_return_id: row.id,
    investment_id: row.investment_id,
    year: Number(row.year),
    month: Number(row.month),
    previous_income_value: null,
    new_income_value: income,
    delta_income_value: 0,
    action: "CREATE",
    created_at:
      row.created_at ??
      new Date(Number(row.year), Math.max(0, Number(row.month) - 1), 1).toISOString(),
    is_synthetic: true,
  };
}

async function loadSnapshotRevisions(
  year: string | null,
  month: string | null,
  investmentId: string | null,
): Promise<MonthlyReturnRevision[]> {
  let snapshotQuery = supabase
    .from("monthly_returns")
    .select("id,investment_id,year,month,income_value,created_at");

  if (year) snapshotQuery = snapshotQuery.eq("year", Number(year));
  if (month) snapshotQuery = snapshotQuery.eq("month", Number(month));
  if (investmentId && investmentId !== "all") snapshotQuery = snapshotQuery.eq("investment_id", investmentId);

  const { data: snapshotRows, error: snapshotError } = await snapshotQuery
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (snapshotError || !Array.isArray(snapshotRows)) return [];
  return snapshotRows.map((row, idx) =>
    toSnapshotRevision(
      row as {
        id: string;
        investment_id: string;
        year: number;
        month: number;
        income_value: number;
        created_at?: string | null;
      },
      idx,
    ),
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const investmentId = searchParams.get("investment_id");

  let query = supabase
    .from("monthly_return_revisions")
    .select("*")
    .order("created_at", { ascending: false });

  if (year) query = query.eq("year", Number(year));
  if (month) query = query.eq("month", Number(month));
  if (investmentId && investmentId !== "all") query = query.eq("investment_id", investmentId);

  const { data, error } = await query.limit(500);
  if (error) {
    if (
      isMissingTableError(error.message, "monthly_return_revisions") ||
      isPermissionError(error.message, "monthly_return_revisions")
    ) {
      const snapshots = await loadSnapshotRevisions(year, month, investmentId);
      return NextResponse.json(snapshots);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(data) && data.length > 0) {
    return NextResponse.json(data);
  }

  const snapshots = await loadSnapshotRevisions(year, month, investmentId);
  return NextResponse.json(snapshots);
}
