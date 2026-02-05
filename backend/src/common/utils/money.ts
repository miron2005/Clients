export function formatEurFromCents(cents: number): string {
  const eur = (cents / 100).toFixed(2).replace(".", ",");
  return `${eur} €`;
}

