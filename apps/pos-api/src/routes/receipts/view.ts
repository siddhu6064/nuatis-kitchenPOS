import { Router, type IRouter, type Request, type Response } from "express";
import { verifyReceiptToken } from "../../lib/receipt-token.js";
import { getSupabaseClient } from "../../lib/supabase.js";

export const receiptViewRouter: IRouter = Router();

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// GET /r/:token — public receipt page (no auth, signed token required)
// ---------------------------------------------------------------------------
receiptViewRouter.get("/:token", async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };

  // Verify receipt token
  let payload: { order_id: string; tenant_id: string };
  try {
    payload = await verifyReceiptToken(token);
  } catch {
    res.status(404).send("Receipt not found or link has expired.");
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    res.status(503).send("Service temporarily unavailable.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", payload.order_id)
    .eq("tenant_id", payload.tenant_id)
    .maybeSingle();

  if (!order) { res.status(404).send("Receipt not found."); return; }

  const [{ data: items }, { data: discounts }, { data: tenant }, { data: payment }] = await Promise.all([
    db.from("order_items").select("name_snapshot, qty, price_cents, status").eq("order_id", payload.order_id).neq("status", "voided"),
    db.from("order_discounts").select("reason, applied_amount_cents").eq("order_id", payload.order_id).is("voided_at", null),
    db.from("tenants").select("name").eq("id", payload.tenant_id).single(),
    db.from("payments").select("method, amount_cents").eq("order_id", payload.order_id).eq("status", "succeeded").maybeSingle(),
  ]);

  const { data: location } = await db
    .from("locations")
    .select("name, address")
    .eq("id", order.location_id)
    .maybeSingle();

  const tenantName = escHtml((tenant as { name: string } | null)?.name ?? "");
  const orderNum = (order["order_number"] as number | null) ?? (order["id"] as string).slice(0, 8);
  const subtotal = order["subtotal_cents"] as number;
  const tax = order["tax_cents"] as number;
  const tip = order["tip_cents"] as number;
  const total = order["total_cents"] as number;
  const date = new Date((order["closed_at"] as string | null) ?? (order["opened_at"] as string)).toLocaleString();
  const addr = location?.address && typeof location.address === "object"
    ? Object.values(location.address as Record<string, string>).map(escHtml).join(", ")
    : "";
  const method = (payment as { method: string } | null)?.method ?? "";

  const itemRows = ((items ?? []) as Array<{ name_snapshot: string; qty: number; price_cents: number }>)
    .map((i) => `<tr>
      <td class="name">${escHtml(i.name_snapshot)}</td>
      <td class="qty">×${i.qty}</td>
      <td class="amount">$${centsToStr(i.price_cents * i.qty)}</td>
    </tr>`)
    .join("");

  const discountRows = ((discounts ?? []) as Array<{ reason: string; applied_amount_cents: number }>)
    .map((d) => `<tr class="discount-row">
      <td>Discount <span class="discount-reason">(${escHtml(d.reason)})</span></td>
      <td style="text-align:right;color:#DC2626;">−$${centsToStr(d.applied_amount_cents)}</td>
    </tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Receipt — ${tenantName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;color:#111827;padding:24px 16px}
    .card{max-width:400px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
    .header{background:#0047FF;padding:20px 24px}
    .header h1{color:#fff;font-size:20px;font-weight:700}
    .header p{color:#bfdbfe;font-size:12px;margin-top:2px}
    .body{padding:20px 24px}
    .meta{font-size:12px;color:#6B7280;margin-bottom:16px}
    .meta span{display:block}
    table{width:100%;border-collapse:collapse}
    td{padding:5px 0;font-size:14px}
    td.qty{color:#6B7280;text-align:center}
    td.amount{text-align:right}
    .divider{border:none;border-top:1px solid #e5e7eb;margin:12px 0}
    .totals td{padding:3px 0;font-size:14px;color:#374151}
    .totals .total td{font-weight:700;color:#111827;font-size:16px;padding-top:8px}
    .discount-row td{color:#6B7280}
    .discount-reason{color:#9CA3AF;font-size:12px}
    .payment{font-size:12px;color:#9CA3AF;text-align:center;margin-top:8px}
    .footer{font-size:11px;color:#9CA3AF;text-align:center;margin-top:16px}
    @media print{body{background:#fff;padding:0}.card{border:none;border-radius:0}}
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${tenantName}</h1>
    ${addr ? `<p>${addr}</p>` : ""}
  </div>
  <div class="body">
    <div class="meta">
      <span>Order #${escHtml(String(orderNum))}</span>
      <span>${escHtml(date)}</span>
    </div>
    <table>
      <tbody>${itemRows}</tbody>
    </table>
    <hr class="divider">
    <table class="totals">
      <tbody>
        <tr><td>Subtotal</td><td style="text-align:right">$${centsToStr(subtotal)}</td></tr>
        ${discountRows}
        <tr><td>Tax</td><td style="text-align:right">$${centsToStr(tax)}</td></tr>
        ${tip > 0 ? `<tr><td>Tip</td><td style="text-align:right">$${centsToStr(tip)}</td></tr>` : ""}
        <tr class="total"><td>Total</td><td style="text-align:right">$${centsToStr(total)}</td></tr>
      </tbody>
    </table>
    ${method ? `<p class="payment">${escHtml(method)}</p>` : ""}
    <p class="footer">Thank you for your visit!</p>
  </div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(html);
});
