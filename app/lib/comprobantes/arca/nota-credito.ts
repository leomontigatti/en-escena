import {
  buildClassCVoucher,
  NOTA_CREDITO_C_CBTE_TIPO,
  type ArcaVoucher,
  type ClassCVoucherBase,
} from "./factura-c";

// Comprobante asociado a la Nota de crédito: el que se anula (`CbtesAsoc`). Es la
// Factura C original o, en una cadena, otra Nota de crédito. Se admite una cadena
// ilimitada de asociación porque cada eslabón sólo referencia al anterior por su
// (tipo, punto de venta, número) y el emisor es siempre el mismo.
export type NotaCreditoCAsociado = {
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  // `AAAAMMDD` del comprobante asociado. Opcional en `CbtesAsoc`.
  cbteFch?: string;
};

export type NotaCreditoCVoucherInput = ClassCVoucherBase & {
  // CUIT del emisor del comprobante asociado. Como el emisor es siempre
  // Proyecciones Artísticas (auto-emisión), coincide con el CUIT del emisor.
  emisorCuit: string;
  asociado: NotaCreditoCAsociado;
};

// Construye el payload `FECAESolicitar` de una Nota de crédito C (tipo 13, #328).
// Es un comprobante espejo total-only de la Factura C: mismo importe total y
// misma base clase C, más el array `CbtesAsoc` que la vincula al comprobante que
// anula. La lógica de emisión (emit-nota-credito.server) resuelve el correlativo
// y el importe; el builder no auto-numera ni decide qué se anula.
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
