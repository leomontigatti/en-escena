export function calculateDepositAmount(input: {
  amount: number;
  percentage: number;
}) {
  return Math.round((input.amount * input.percentage) / 100);
}
