/** THROWAWAY PROTOTYPE — contracts shared by ticket #550's variants. */
import type {
  InscriptionReading,
  PaymentReading,
  PrototypeState,
} from "./fixtures";
import type { ChoreographyReading } from "./rollup";

export type AllocationUpsert = {
  paymentId: string;
  inscriptionId: string;
  amount: number;
};

/** View 2: a choreography's inscriptions and allocations. */
export type AllocationVariantProps = {
  state: PrototypeState;
  choreography: ChoreographyReading;
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
  onApplyUpserts: (upserts: AllocationUpsert[]) => void;
};

export const allocationDetailVariants = [
  { key: "A", name: "Presets primero" },
  { key: "B", name: "Barras de avance + presets" },
  { key: "C", name: "Dos paneles, monto a mano" },
];
