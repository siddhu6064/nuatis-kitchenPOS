import { Router, type IRouter, type Request, type Response } from "express";
import { ListReceiptsQuerySchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";

export const receiptHistoryRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /v1/receipts — paginated receipt history (email + SMS)
// ---------------------------------------------------------------------------
receiptHistoryRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = ListReceiptsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid query params", details: parsed.error.flatten() } });
      return;
    }

    const { limit, offset, channel, status } = parsed.data;
    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // ── Fetch email messages ────────────────────────────────────────────────
    type EmailRow = {
      id: number; order_id: string | null; to_email: string;
      status: string; provider_message_id: string | null;
      error: string | null; sent_at: string | null; created_at: string;
    };
    type OrderRow = { id: string; order_number: number | null; subtotal_cents: number; tax_cents: number; tip_cents: number };

    let emailRows: EmailRow[] = [];
    let smsRows: Array<{
      id: number; order_id: string | null; to_phone: string;
      status: string; provider_message_id: string | null;
      error: string | null; sent_at: string | null; created_at: string;
    }> = [];

    const [emailResult, smsResult] = await Promise.all([
      channel && channel !== "email" ? Promise.resolve({ data: [] }) :
        (() => {
          let q = db
            .from("email_messages")
            .select("id, order_id, to_email, status, provider_message_id, error, sent_at, created_at")
            .eq("tenant_id", tenantId);
          if (status && status !== "bounced") q = q.eq("status", status);
          else if (status === "bounced") q = q.eq("status", "bounced");
          return q.order("created_at", { ascending: false }).limit(limit + offset + 100);
        })(),
      channel && channel !== "sms" ? Promise.resolve({ data: [] }) :
        (() => {
          let q = db
            .from("sms_messages")
            .select("id, order_id, to_phone, status, provider_message_id, error, sent_at, created_at")
            .eq("tenant_id", tenantId);
          // sms_messages has no 'bounced' status — skip if filtering for bounced
          if (status === "bounced") return Promise.resolve({ data: [] });
          if (status) q = q.eq("status", status);
          return q.order("created_at", { ascending: false }).limit(limit + offset + 100);
        })(),
    ]);

    emailRows = (emailResult.data ?? []) as EmailRow[];
    smsRows = (smsResult.data ?? []) as typeof smsRows;

    // ── Fetch order details for enrichment ──────────────────────────────────
    const orderIds = Array.from(new Set([
      ...emailRows.map((r) => r.order_id),
      ...smsRows.map((r) => r.order_id),
    ].filter(Boolean))) as string[];

    const orderMap = new Map<string, OrderRow>();
    if (orderIds.length > 0) {
      const { data: orders } = await db
        .from("orders")
        .select("id, order_number, subtotal_cents, tax_cents, tip_cents")
        .in("id", orderIds);
      for (const o of (orders ?? []) as OrderRow[]) {
        orderMap.set(o.id, o);
      }
    }

    // ── Merge + normalise ────────────────────────────────────────────────────
    type Entry = {
      id: string; order_id: string | null; order_number: number | null;
      order_total_cents: number | null; channel: "email" | "sms";
      recipient: string; status: string; provider_message_id: string | null;
      error: string | null; sent_at: string | null; created_at: string;
    };

    function enrichOrder(orderId: string | null) {
      if (!orderId) return { order_number: null, order_total_cents: null };
      const o = orderMap.get(orderId);
      if (!o) return { order_number: null, order_total_cents: null };
      return {
        order_number: o.order_number,
        order_total_cents: (o.subtotal_cents ?? 0) + (o.tax_cents ?? 0) + (o.tip_cents ?? 0),
      };
    }

    const merged: Entry[] = [
      ...emailRows.map((r) => ({
        id: String(r.id),
        order_id: r.order_id,
        channel: "email" as const,
        recipient: r.to_email,
        status: r.status,
        provider_message_id: r.provider_message_id,
        error: r.error,
        sent_at: r.sent_at,
        created_at: r.created_at,
        ...enrichOrder(r.order_id),
      })),
      ...smsRows.map((r) => ({
        id: String(r.id),
        order_id: r.order_id,
        channel: "sms" as const,
        recipient: r.to_phone,
        status: r.status,
        provider_message_id: r.provider_message_id,
        error: r.error,
        sent_at: r.sent_at,
        created_at: r.created_at,
        ...enrichOrder(r.order_id),
      })),
    ];

    // Sort by created_at descending
    merged.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const total_count = merged.length;
    const entries = merged.slice(offset, offset + limit);

    res.json({ entries, total_count });
  }
);
