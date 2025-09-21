export function formatPLN(minorUnits: number | null | undefined): string {
  const value = (minorUnits ?? 0) / 100;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(value);
}
