/** Format price with currency sign — compact for overlays */
export function formatPrice(value: number, currencySign = '$'): string {
  if (!value) return '';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 100) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 10) return `${sign}${currencySign}${abs.toFixed(1)}`;
  return `${sign}${currencySign}${abs.toFixed(2)}`;
}

/** Format cents to display string */
export function formatCents(cents: number, symbol = '$'): string {
  if (!cents) return '';
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  const val = abs / 100;
  if (val >= 10 && val === Math.floor(val)) return `${sign}${symbol}${val.toLocaleString()}`;
  return `${sign}${symbol}${val.toFixed(2)}`;
}

/** Format P/L percentage */
export function formatPLPercent(giving: number, receiving: number): string {
  if (giving === 0 || receiving === 0) return '';
  return `(${(((receiving / giving) - 1) * 100).toFixed(2)}%)`;
}
