const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

export interface EndOfDayReport {
  tenant_id: string;
  location_id: string | null;
  date: string;
  is_snapshot: boolean;
  snapshot_at: string | null;
  gross_sales_cents: number;
  taxable_cents: number;
  tax_cents: number;
  tips_cents: number;
  discounts_cents: number;
  voids_cents: number;
  refunds_cents: number;
  net_cents: number;
  order_count: number;
  paid_order_count: number;
  voided_order_count: number;
  by_method: Array<{
    method: string;
    count: number;
    gross_cents: number;
  }>;
  by_item: Array<{
    menu_item_id: string | null;
    name: string;
    qty_sold: number;
    gross_cents: number;
    pct_of_total: number;
  }>;
  by_staff: Array<{
    staff_id: string;
    full_name: string;
    ticket_count: number;
    gross_cents: number;
    tips_cents: number;
  }>;
}

export interface DailyHistoryEntry {
  date: string;
  gross_sales_cents: number;
  net_cents: number;
  order_count: number;
}

export function emptyReport(date: string): EndOfDayReport {
  return {
    tenant_id: "",
    location_id: null,
    date,
    is_snapshot: false,
    snapshot_at: null,
    gross_sales_cents: 0,
    taxable_cents: 0,
    tax_cents: 0,
    tips_cents: 0,
    discounts_cents: 0,
    voids_cents: 0,
    refunds_cents: 0,
    net_cents: 0,
    order_count: 0,
    paid_order_count: 0,
    voided_order_count: 0,
    by_method: [],
    by_item: [],
    by_staff: [],
  };
}

async function serverFetch<T>(
  path: string,
  posJwt: string
): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API}${path}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${posJwt}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getEndOfDay(
  posJwt: string,
  date: string,
  location_id?: string
): Promise<EndOfDayReport | null> {
  const qs = new URLSearchParams({ date });
  if (location_id) qs.set("location_id", location_id);
  return serverFetch<EndOfDayReport>(
    `/v1/reports/end-of-day?${qs.toString()}`,
    posJwt
  );
}

export async function getDailyHistory(
  posJwt: string,
  limit = 30,
  location_id?: string
): Promise<DailyHistoryEntry[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (location_id) qs.set("location_id", location_id);
  const result = await serverFetch<DailyHistoryEntry[]>(
    `/v1/reports/daily-history?${qs.toString()}`,
    posJwt
  );
  return result ?? [];
}
