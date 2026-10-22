import {
  buildClassCVoucher,
  NOTA_CREDITO_C_CBTE_TIPO,
  NOTA_DEBITO_C_CBTE_TIPO,
  type ArcaVoucher,
  type ClassCVoucherBase,
} from "./factura-c";

// The comprobante a note amends (`CbtesAsoc`): always the unit's `Factura C`,
// because every note anchors at the invoice (the star, ADR-0014 §5). ARCA
// rejects a note without it (10197, #686).
export type ClassCNoteAsociado = {
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  // The associated comprobante's `AAAAMMDD`. Optional in `CbtesAsoc`.
  cbteFch?: string;
};

export type ClassCNoteVoucherInput = ClassCVoucherBase & {
  // The CUIT of the associated comprobante's issuer. Since the issuer is always
  // `Proyecciones Artísticas` (self-issuance), it matches the issuer's CUIT.
  emisorCuit: string;
  asociado: ClassCNoteAsociado;
};

// Builds the `FECAESolicitar` payload of a `Nota de crédito C` (type 13): the
// class C base plus the `CbtesAsoc` array naming the invoice it credits. The
// emitter resolves the number and the amount; the builder decides neither.
export function buildNotaCreditoCVoucher(
  input: ClassCNoteVoucherInput,
): ArcaVoucher {
  return buildClassCNoteVoucher(input, NOTA_CREDITO_C_CBTE_TIPO);
}

// The `Nota de débito C` (type 12) twin: the same payload under its own type,
// which #686 saw ARCA authorize with no extra field.
export function buildNotaDebitoCVoucher(
  input: ClassCNoteVoucherInput,
): ArcaVoucher {
  return buildClassCNoteVoucher(input, NOTA_DEBITO_C_CBTE_TIPO);
}

function buildClassCNoteVoucher(
  input: ClassCNoteVoucherInput,
  cbteTipo: number,
): ArcaVoucher {
  const cbtesAsoc: NonNullable<ArcaVoucher["CbtesAsoc"]> = [
    {
      Tipo: input.asociado.cbteTipo,
      PtoVta: input.asociado.ptoVta,
      Nro: input.asociado.cbteNro,
      Cuit: input.emisorCuit,
      ...(input.asociado.cbteFch ? { CbteFch: input.asociado.cbteFch } : {}),
    },
  ];

  return buildClassCVoucher(input, { cbteTipo, cbtesAsoc });
}
