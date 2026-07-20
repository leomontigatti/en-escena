import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPaymentNumber } from "@/lib/finances/payment-number";

import { formatAmount, formatDate } from "../formatters";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>
>;
type PaymentRow = ChoreographyFinanceDetailLoaderData["payments"][number];

/**
 * Opciones de un `Select` de pagos: número, fecha y disponible de cada pago. Se
 * comparte entre los diálogos de cobro (seña, saldo y el cobro en bloque del
 * header) para que todos muestren la misma etiqueta.
 */
export function PaymentSelectItems({ payments }: { payments: PaymentRow[] }) {
  return (
    <>
      {payments.map((payment) => (
        <SelectItem key={payment.id} value={payment.id}>
          {formatPaymentNumber(payment.paymentNumber)} ·{" "}
          {formatDate(payment.paymentDate)} · disponible{" "}
          {formatAmount(payment.availableAmount)}
        </SelectItem>
      ))}
    </>
  );
}

/**
 * Campo de selección de pago de los diálogos de cobro por inscripción: muestra el
 * `Select` con los pagos elegibles o, si no hay ninguno con disponible suficiente,
 * una alerta con el motivo. El label `Pago` solo se muestra junto al `Select`.
 */
export function PaymentField({
  payments,
  value,
  onValueChange,
  disabled,
  emptyMessage,
}: {
  payments: PaymentRow[];
  value: string | null;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  emptyMessage: string;
}) {
  if (payments.length === 0) {
    return (
      <Alert variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertDescription>{emptyMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Pago</span>
      <Select
        name="paymentId"
        value={value ?? ""}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Elegí un pago" />
        </SelectTrigger>
        <SelectContent>
          <PaymentSelectItems payments={payments} />
        </SelectContent>
      </Select>
    </div>
  );
}
