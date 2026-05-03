/** Shared formatting utilities used across Reports and other components. */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format an integer cent value as a USD dollar string.
 * @example formatMoney(1099) → "$10.99"
 */
export function formatMoney(cents: number): string {
  return usdFormatter.format(cents / 100);
}

/**
 * Format an ISO date string (YYYY-MM-DD or ISO timestamp) as "Month D".
 * @example formatDate("2026-05-01") → "May 1"
 */
export function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format a float as a percentage string with one decimal place.
 * @example formatPct(12.5) → "12.5%"
 */
export function formatPct(num: number): string {
  return `${num.toFixed(1)}%`;
}
