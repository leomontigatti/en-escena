import { addDays } from "date-fns/addDays";
import { format } from "date-fns/format";
import { parse } from "date-fns/parse";

import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import {
  ArcaClient,
  type ArcaBillingPort,
} from "@/lib/comprobantes/arca/client.server";
import { FACTURA_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import { emitFacturaC } from "@/lib/comprobantes/emit-factura-c.server";

// The dev seed's comprobante, `9999-00000001` (docs/local-auth.md).

// A sales point no real issuer configuration uses, so the demo invoice's number
// cannot collide with a comprobante a production refresh brought in: the
// unique index is on sales point, type and number.
const DEMO_SALES_POINT = 9999;

// The CAE of the WSFEv1 manual's own example and a placeholder issuer CUIT, not
// the association's: the printed comprobante and its QR must not pass for one
// the real issuer emitted.
const DEMO_CAE = "41124578989845";
const DEMO_ISSUER_CUIT = "20000000001";
// ARCA's id for `Consumidor Final`, the recipient every `Factura C` here has.
const DEMO_RECEPTOR_IVA_CONDITION_ID = 5;

// Stands in for ARCA: the sales point has issued nothing, and every request is
// authorized as asked, with a CAE that expires ten days on as a real one
// does. No network, no certificate.
const demoBilling: ArcaBillingPort = {
  getLastVoucher: async () => ({
    cbteNro: 0,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: DEMO_SALES_POINT,
  }),
  createVoucher: async (request) => {
    const caeFchVto = format(
      addDays(parse(request.CbteFch, "yyyyMMdd", new Date()), 10),
      "yyyyMMdd",
    );

    return {
      cae: DEMO_CAE,
      caeFchVto,
      response: {
        FeCabResp: { Resultado: "A" },
        FeDetResp: {
          FECAEDetResponse: [
            {
              CbteDesde: request.CbteDesde,
              CbteHasta: request.CbteHasta,
              CbteFch: request.CbteFch,
              Resultado: "A",
              CAE: DEMO_CAE,
              CAEFchVto: caeFchVto,
            },
          ],
        },
      },
    };
  },
  getVoucherInfo: async () => null,
};

/**
 * Emits a `Factura C` for what the choreography has paid, through the real
 * emission: the comprobante, its lines and its snapshot are the ones the UI
 * would have produced. Only the authorization is a stand-in, so the CAE and
 * the QR it prints are not a fiscal document.
 */
export async function invoiceChoreography(input: {
  choreographyId: string;
  eventId: string;
}) {
  const result = await emitFacturaC(
    {
      anchor: choreographyAnchor(input.choreographyId),
      eventId: input.eventId,
    },
    {
      client: new ArcaClient(demoBilling),
      ptoVta: DEMO_SALES_POINT,
      issuerCuit: DEMO_ISSUER_CUIT,
      receptorIvaConditionId: DEMO_RECEPTOR_IVA_CONDITION_ID,
    },
  );

  if (!result.ok) {
    throw new Error(
      `Dev seed could not invoice the scored choreography: ${JSON.stringify(result)}`,
    );
  }
}
