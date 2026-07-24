import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
} from "@arcasdk/core";

// Fixtures con la forma real de las respuestas de homologación de WSFEv1,
// tomadas del circuito validado por el spike #428 y de los ejemplos oficiales
// del manual WSFEv1 documentados en la research #321. Ningún test toca la red:
// se ejercita el wrapper contra estas respuestas ya deserializadas por el SDK.

// `FECAESolicitar` aprobado: ARCA devuelve CAE + vencimiento. CAE/CbteFch del
// ejemplo oficial del manual (§4.2 de la research #321).
export const facturaCAprobada: CreateVoucherResultDto = {
  cae: "41124578989845",
  caeFchVto: "20260801",
  response: {
    FeCabResp: {
      Cuit: 30717611590,
      PtoVta: 1,
      CbteTipo: 11,
      FchProceso: "20260722100000",
      CantReg: 1,
      Resultado: "A",
      Reproceso: "N",
    },
    FeDetResp: {
      FECAEDetResponse: [
        {
          Concepto: 1,
          DocTipo: 99,
          DocNro: 0,
          CbteDesde: 43,
          CbteHasta: 43,
          CbteFch: "20260722",
          Resultado: "A",
          CAE: "41124578989845",
          CAEFchVto: "20260801",
        },
      ],
    },
  },
};

// Aprobado *con* observaciones: el comprobante queda autorizado (hay CAE) pero
// ARCA adjunta un `Obs {Code, Msg}` que conviene auditar (§4.3).
export const facturaCAprobadaConObservaciones: CreateVoucherResultDto = {
  cae: "71234567890123",
  caeFchVto: "20260801",
  response: {
    FeCabResp: { Resultado: "A" },
    FeDetResp: {
      FECAEDetResponse: [
        {
          CbteDesde: 44,
          CbteHasta: 44,
          CbteFch: "20260722",
          Resultado: "A",
          CAE: "71234567890123",
          CAEFchVto: "20260801",
          Observaciones: {
            Obs: [
              {
                Code: 10063,
                Msg: "Msg: El campo Condicion Frente al IVA del receptor es obligatorio",
              },
            ],
          },
        },
      ],
    },
  },
};

// `FECAESolicitar` rechazado: sin CAE, `Resultado` "R" y un `Err {Code, Msg}` que
// explica el motivo del rechazo.
export const facturaCRechazada: CreateVoucherResultDto = {
  cae: "",
  caeFchVto: "",
  response: {
    FeCabResp: { Resultado: "R" },
    FeDetResp: {
      FECAEDetResponse: [
        {
          CbteDesde: 43,
          CbteHasta: 43,
          Resultado: "R",
          Observaciones: {
            Obs: [
              {
                Code: 10016,
                Msg: "El numero o fecha del comprobante no se corresponde con el proximo a autorizar",
              },
            ],
          },
        },
      ],
    },
    Errors: {
      Err: [
        {
          Code: 10016,
          Msg: "El numero o fecha del comprobante no se corresponde con el proximo a autorizar",
        },
      ],
    },
  },
};

// `FECompUltimoAutorizado` con historia: el punto de venta ya emitió hasta el 42.
export const ultimoAutorizado: LastVoucherResultDto = {
  cbteNro: 42,
  cbteTipo: 11,
  ptoVta: 1,
};

// `FECompUltimoAutorizado` de un punto de venta sin comprobantes: ARCA devuelve 0.
export const ultimoAutorizadoVacio: LastVoucherResultDto = {
  cbteNro: 0,
  cbteTipo: 11,
  ptoVta: 1,
};

// `FECAESolicitar` aprobado de una Nota de crédito C (tipo 13, #449): ARCA
// devuelve CAE + vencimiento igual que una factura; sólo cambia `CbteTipo`.
export const notaCreditoCAprobada: CreateVoucherResultDto = {
  cae: "41124599990011",
  caeFchVto: "20260801",
  response: {
    FeCabResp: {
      Cuit: 30717611590,
      PtoVta: 1,
      CbteTipo: 13,
      FchProceso: "20260722100500",
      CantReg: 1,
      Resultado: "A",
      Reproceso: "N",
    },
    FeDetResp: {
      FECAEDetResponse: [
        {
          Concepto: 1,
          DocTipo: 99,
          DocNro: 0,
          CbteDesde: 8,
          CbteHasta: 8,
          CbteFch: "20260722",
          Resultado: "A",
          CAE: "41124599990011",
          CAEFchVto: "20260801",
        },
      ],
    },
  },
};

// `FECompUltimoAutorizado` de la serie de Notas de crédito (tipo 13): corre por
// un correlativo propio, separado del de las facturas. Acá ya emitió hasta el 7.
export const ultimoNotaCreditoAutorizado: LastVoucherResultDto = {
  cbteNro: 7,
  cbteTipo: 13,
  ptoVta: 1,
};
