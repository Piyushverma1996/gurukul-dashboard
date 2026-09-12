const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function formatINR(amount: number): string {
  return inr.format(amount);
}
