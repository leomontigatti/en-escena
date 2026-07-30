/** PROTOTIPO DESCARTABLE — contrato común a las tres variantes del ticket #550. */
import type {
  InscriptionReading,
  PaymentReading,
  PrototypeState,
} from "./fixtures";

export type AllocationVariantProps = {
  state: PrototypeState;
  inscriptions: InscriptionReading[];
  payments: PaymentReading[];
  selectedPaymentId: string | null;
  onSelectPayment: (paymentId: string) => void;
  onSelectPrice: (inscriptionId: string, priceId: string | null) => void;
  onAllocate: (
    paymentId: string,
    inscriptionId: string,
    amount: number,
  ) => void;
};

export const allocationPrototypeVariants = [
  { key: "A", name: "El pago manda (dos paneles)" },
  { key: "B", name: "El plantel manda (barras + acción masiva)" },
  { key: "C", name: "Reparto asistido (panel con estrategias)" },
];
