export function calcTipFromPct(subtotal: number, pct: number): number {
  const subtotalCents = Math.round(subtotal * 100);
  const tipCents = Math.round(subtotalCents * pct);
  return tipCents / 100;
}

export function calcGrandTotal(subtotal: number, tax: number, tip: number): number {
  const cents = Math.round(subtotal * 100) + Math.round(tax * 100) + Math.round(tip * 100);
  return cents / 100;
}

export function fmt(n: number): string {
  return n.toFixed(2);
}
