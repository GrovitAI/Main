export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function sumSettlementAmounts(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
