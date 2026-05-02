import { Router, type IRouter, type Request, type Response } from "express";
import { SendReceiptRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { writeAuditLog } from "../../lib/db.js";
import { signReceiptToken } from "../../lib/receipt-token.js";
import { enqueueReceiptEmail, enqueueReceiptSms } from "../../lib/queue.js";
import { env } from "../../env.js";

export const receiptSendRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/receipts — enqueue receipt delivery
// ---------------------------------------------------------------------------
receiptSendRouter.post(
  "/",
  requireAuth(),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = SendReceiptRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const orderId = req.params["id"]!;
    const { email, phone, sms_opt_in, sms_opt_in_text } = parsed.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Validate order exists and is paid
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select("id, status, location_id")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
    if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
    if (order.status !== "paid") {
      res.status(409).json({ error: { code: "conflict", message: `Cannot send receipt for order with status '${order.status as string}' — order must be paid` } });
      return;
    }

    // Upsert contact — look up by phone first, then email, then create
    let contactId: string | null = null;
    let contactSmsOptIn = false;

    if (phone) {
      const { data: existing } = await db
        .from("contacts")
        .select("id, sms_opt_in")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .maybeSingle();

      if (existing) {
        contactId = existing.id as string;
        contactSmsOptIn = existing.sms_opt_in as boolean;
      }
    }

    if (!contactId && email) {
      const { data: existing } = await db
        .from("contacts")
        .select("id, sms_opt_in")
        .eq("tenant_id", tenantId)
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        contactId = existing.id as string;
        contactSmsOptIn = existing.sms_opt_in as boolean;
      }
    }

    if (!contactId) {
      const { data: newContact } = await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone: phone ?? null, email: email ?? null })
        .select("id, sms_opt_in")
        .single();
      contactId = newContact?.id as string | null;
      contactSmsOptIn = false;
    }

    // Update TCPA consent fields if customer opts in to SMS
    if (sms_opt_in && phone && contactId) {
      await db.from("contacts").update({
        sms_opt_in: true,
        sms_opt_in_at: new Date().toISOString(),
        sms_opt_in_text: sms_opt_in_text ?? "Yes, send me text receipts.",
        sms_opt_in_ip: req.ip ?? null,
      }).eq("id", contactId);
      contactSmsOptIn = true;
    }

    // Sign receipt token and build public URL
    const receiptToken = await signReceiptToken(orderId, tenantId);
    const receiptUrl = `${env.RECEIPT_BASE_URL}/r/${receiptToken}`;

    // Enqueue delivery jobs
    const jobsEnqueued: Array<"email" | "sms"> = [];

    if (email) {
      await enqueueReceiptEmail({ tenant_id: tenantId, order_id: orderId, to: email, receipt_url: receiptUrl });
      jobsEnqueued.push("email");
    }

    if (phone && contactSmsOptIn) {
      await enqueueReceiptSms({ tenant_id: tenantId, order_id: orderId, to: phone, receipt_url: receiptUrl });
      jobsEnqueued.push("sms");
    }

    const staffId = req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;
    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: staffId,
      action: "receipt_send",
      target_type: "order",
      target_id: orderId,
      payload: { channels: jobsEnqueued, contact_id: contactId, email, phone: phone ? "[redacted]" : null },
      ip_address: req.ip,
    });

    res.status(202).json({ jobs_enqueued: jobsEnqueued, receipt_token: receiptToken });
  }
);
