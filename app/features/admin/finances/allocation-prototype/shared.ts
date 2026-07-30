/** PROTOTIPO DESCARTABLE — contratos comunes de las variantes del ticket #550. */
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

/** Vista 1: la lista financiera de coreografías de una academia. */
export type AllocationListVariantProps = {
  choreographies: ChoreographyReading[];
  payments: PaymentReading[];
  onApplyUpserts: (upserts: AllocationUpsert[]) => void;
};

/** Vista 2: las inscripciones y asignaciones de una coreografía. */
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

export const allocationListVariants = [
  { key: "A", name: "Tabla de hoy + selección" },
  { key: "B", name: "Worklist por lo que falta" },
  { key: "C", name: "Primero la plata" },
];

export const allocationDetailVariants = [
  { key: "A", name: "Presets primero" },
  { key: "B", name: "Barras de avance + presets" },
  { key: "C", name: "Dos paneles, monto a mano" },
];
