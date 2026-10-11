import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";

// Fixtures with the real shape of WSFEv1's homologation responses, taken from
// the circuit validated by spike #428 and from the official examples in the
// WSFEv1 manual documented in research #321. No test touches the network: the
// wrapper is exercised against these responses, already deserialized by the SDK.

// `FECAESolicitar` approved: ARCA returns CAE + expiry. CAE/CbteFch from the
// official example in the manual (§4.2 of research #321).
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

// Approved *with* observations: the comprobante ends up authorized (there is a
// CAE) but ARCA attaches an `Obs {Code, Msg}` worth auditing (§4.3).
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

// `FECAESolicitar` rejected: no CAE, `Resultado` "R" and an `Err {Code, Msg}`
// explaining the reason for the rejection.
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

// `FECompUltimoAutorizado` with history: the sales point has emitted up to 42.
export const ultimoAutorizado: LastVoucherResultDto = {
  cbteNro: 42,
  cbteTipo: 11,
  ptoVta: 1,
};

// `FECompUltimoAutorizado` for a sales point with no comprobantes: ARCA returns 0.
export const ultimoAutorizadoVacio: LastVoucherResultDto = {
  cbteNro: 0,
  cbteTipo: 11,
  ptoVta: 1,
};

// `FECAESolicitar` approved for a `Nota de crédito C` (type 13, #449): ARCA
// returns CAE + expiry just as for an invoice; only `CbteTipo` changes.
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

// `FECompUltimoAutorizado` for the credit note series (type 13): it runs on
// a sequence of its own, separate from the invoices'. Here it has emitted up to 7.
export const ultimoNotaCreditoAutorizado: LastVoucherResultDto = {
  cbteNro: 7,
  cbteTipo: 13,
  ptoVta: 1,
};

// `FECompConsultar` for `Factura C` 43: the shape in which ARCA returns an already
// authorized comprobante, verified against homologation by the spike (#574). It
// is what resolves an authorization left without a response (ADR-0012).
export const facturaCConsultada: VoucherInfoResultDto = {
  codAutorizacion: "41124578989845",
  emisionTipo: "CAE",
  fchVto: "20260801",
  fchProceso: "20260722100000",
  resultado: "A",
  concepto: 2,
  docTipo: 99,
  docNro: 0,
  cbteDesde: 43,
  cbteHasta: 43,
  cbteFch: "20260722",
  impTotal: 1000,
  impNeto: 1000,
  monId: "PES",
  monCotiz: 1,
};

// `FECompConsultar` for `Nota de crédito C` 8, with the same shape.
export const notaCreditoCConsultada: VoucherInfoResultDto = {
  ...facturaCConsultada,
  codAutorizacion: "41124599990011",
  cbteDesde: 8,
  cbteHasta: 8,
  impTotal: 7000,
  impNeto: 7000,
};
