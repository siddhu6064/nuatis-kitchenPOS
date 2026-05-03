import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireManagerPin } from "../../middleware/manager-pin.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { getStripe, refundPaymentIntent } from "../../lib/stripe.js";
import { writeAuditLog } from "../../lib/db.js";

export const refundsRouter: IRouter = Router();

const RefundRequestSchema = z.object({
  amount_cents: z.number().int().positive().optional(),
  reason: z.string().min(1).max(500),
  manager_pin: z.string().optional(), // consumed by middleware; still in body
});

// ---------------------------------------------------------------------------
// POST /v1/payments/:payment_id/refund
//
// Auth rules (mirror void.ts):
//   • Session JWT with role owner/manager → can refund directly (no PIN).
//   • Terminal JWT or cashier session → requires manager PIN in body.
// ---------------------------------------------------------------------------
refundsRouter.post(
  "/:payment_id/refund",
  requireAuth(),
  (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth!;
    if (auth.kind === "session" && (auth.role === "owner" || auth.role === "manager")) {
      next();
      return;
    }
    void requireManagerPin()(req, res, next);
  },
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = RefundRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const paymentId = req.params["payment_id"]!;
    const { amount_cents, reason } = parsed.data;
    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    const managerId = req.manager_id ?? callerId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Fetch payment (tenant-scoped)
    const { data: payment, error: payErr } = await db
      .from("payments")
      .select("id, order_id, tenant_id, amount_cents, tip_cents, method, status, stripe_payment_intent_id")
      .eq("id", paymentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (payErr) { res.status(500).json({ error: { code: "internal_error", message: payErr.message } }); return; }
    if (!payment) { res.status(404).json({ error: { code: "not_found", message: "Payment not found" } }); return; }
    if (payment.status !== "succeeded") {
      res.status(409).json({ error: { code: "conflict", message: `Cannot refund payment with status '${payment.status as string}'` } });
      return;
    }

    const maxRefundable = (payment.amount_cents as number);
    const refundAmount = amount_cents ?? maxRefundable;

    if (refundAmount > maxRefundable) {
      res.status(400).json({ error: { code: "bad_request", message: `Refund amount ${refundAmount} exceeds payment amount ${maxRefundable}` } });
      return;
    }

    const method = payment.method as string;
    let stripeRefundId: string | null = null;
    let appFeeRefundCents = 0;

    // ── Stripe refund ─────────────────────────────────────────────────────────
    if (method === "card_stripe") {
      const piId = payment.stripe_payment_intent_id as string | null;
      if (!piId) {
        res.status(409).json({ error: { code: "conflict", message: "No PaymentIntent ID on this payment" } });
        return;
      }
      if (!getStripe()) {
        // Mock mode — skip real refund but still record
        stripeRefundId = `re_mock_${Date.now()}`;
      } else {
        try {
          const refund = await refundPaymentIntent(piId, refundAmount, true, true);
          stripeRefundId = refund.id;
          // Stripe reverses fee proportionally — record what was reversed
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          appFeeRefundCents = (refund as any).application_fee_refund?.amount ?? 0;
        } catch (err: unknown) {
          res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
          return;
        }
      }
    }

    // ── Cash refund — create a cash_event ─────────────────────────────────────
    if (method === "cash") {
      const { data: openSession } = await db
        .from("cash_drawer_sessions")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("location_id", (
          await db.from("orders").select("location_id").eq("id", payment.order_id).maybeSingle()
        ).data?.location_id)
        .eq("status", "open")
        .maybeSingle();

      if (openSession) {
        await db.from("cash_events").insert({
          session_id: openSession.id,
          type: "cash_refund",
          amount_cents: -refundAmount,
          reason,
          staff_id: managerId,
        });
      }
    }

    // ── Insert refund row ─────────────────────────────────────────────────────
    const { data: refundRow, error: refundErr } = await db
      .from("refunds")
      .insert({
        payment_id: paymentId,
        stripe_refund_id: stripeRefundId,
        amount_cents: refundAmount,
        reason,
        refunded_by_staff_id: managerId,
        application_fee_refund_cents: appFeeRefundCents,
      })
      .select()
      .single();

    if (refundErr) {
      res.status(500).json({ error: { code: "internal_error", message: refundErr.message } });
      return;
    }

    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: managerId,
      action: "payment_refunded",
      target_type: "payment",
      target_id: paymentId,
      payload: {
        method,
        refund_amount_cents: refundAmount,
        reason,
        stripe_refund_id: stripeRefundId,
        manager_id: managerId,
      },
      ip_address: req.ip,
    });

    // Fetch updated payment
    const { data: updatedPayment } = await db.from("payments").select("*").eq("id", paymentId).single();

    res.status(201).json({ payment: updatedPayment, refund: refundRow });
  }
);
