/**
 * Shared formatting utilities.
 */

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

/**
 * Format a number as Japanese Yen (e.g. "¥1,234").
 */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}
