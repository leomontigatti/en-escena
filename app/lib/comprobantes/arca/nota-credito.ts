import {
  buildClassCVoucher,
  NOTA_CREDITO_C_CBTE_TIPO,
  type ArcaVoucher,
  type ClassCVoucherBase,
} from "./factura-c";

// The comprobante associated with the credit note: the one being annulled
// (`CbtesAsoc`). It is the original `Factura C` or, in a chain, another credit
// note. An unlimited association chain is allowed because each link only
// references the previous one by its (type, sales point, number) and the issuer
// is always the same.
export type NotaCreditoCAsociado = {
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  // The associated comprobante's `AAAAMMDD`. Optional in `CbtesAsoc`.
  cbteFch?: string;
};

export type NotaCreditoCVoucherInput = ClassCVoucherBase & {
  // The CUIT of the associated comprobante's issuer. Since the issuer is always
  // Proyecciones Artísticas (self-issuance), it matches the issuer's CUIT.
  emisorCuit: string;
  asociado: NotaCreditoCAsociado;
};

// Builds the `FECAESolicitar` payload of a `Nota de crédito C` (type 13, #328). It
// is a total-only mirror of the `Factura C`: the same total amount and the same
// class C base, plus the `CbtesAsoc` array linking it to the comprobante it
// annuls. The emission logic (emit-nota-credito.server) resolves the sequence
// number and the amount; the builder neither auto-numbers nor decides what is
// annulled.
export function buildNotaCreditoCVoucher(
  input: NotaCreditoCVoucherInput,
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

  return buildClassCVoucher(input, {
    cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
    cbtesAsoc,
  });
}
