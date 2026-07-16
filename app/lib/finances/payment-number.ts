export const paymentNumberDigits = 5;

export function formatPaymentNumber(value: number) {
  return String(value).padStart(paymentNumberDigits, "0");
}
