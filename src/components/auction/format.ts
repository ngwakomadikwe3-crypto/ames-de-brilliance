/** Money and date formatting shared by the auction UI components. */

/** Integer minor units -> localized currency string ("$18,000.00", "P1,250.00"). */
export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toLocaleString("en-US")}`;
  }
}

/** "31 Aug" style label for session dates. */
export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
