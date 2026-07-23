import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import {
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  handleAdminComprobantesListAction,
  loadAdminComprobantesList,
} from "@/features/admin/comprobantes/list/server";
import {
  ArcaClient,
  type ArcaBillingPort,
} from "@/lib/comprobantes/arca/client.server";
import {
  facturaCRechazada,
  notaCreditoCAprobada,
  ultimoNotaCreditoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";
import type { FacturaCEmissionDeps } from "@/lib/comprobantes/emit-factura-c.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { annulComprobanteConfirmValue, annulComprobanteIntent } from "./shared";

installDatabaseTestHooks();

function facturaCInput(
  overrides: Partial<RecordComprobanteInput> & {
    choreographyId: string;
    eventId: string;
  },
): RecordComprobanteInput {
  return {
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 1,
    cbteFch: "20260722",
    impTotal: 10000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "75123456789012",
    caeVto: "20260801",
    lines: [],
    ...overrides,
  };
}

type EventCatalog = Awaited<ReturnType<typeof createEventCatalog>>;

async function seedChoreography(input: {
  academyName: string;
  catalog: EventCatalog;
  email: string;
  eventId: string;
  name: string;
}) {
  const academy = await createAcademyRecord({
    academyName: input.academyName,
    email: input.email,
  });
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: input.eventId,
    modalityId: input.catalog.modality.id,
    scheduleCapacityId: input.catalog.scheduleCapacity.id,
    name: input.name,
  });

  return { academy, choreography };
}

function fakeBilling(
  overrides: Partial<ArcaBillingPort> = {},
): ArcaBillingPort {
  return {
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ultimoNotaCreditoAutorizado,
    ),
    createVoucher: vi.fn(
      async (): Promise<CreateVoucherResultDto> => notaCreditoCAprobada,
    ),
    ...overrides,
  };
}

function emissionDeps(billing: ArcaBillingPort): FacturaCEmissionDeps {
  return {
    client: new ArcaClient(billing),
    ptoVta: 1,
    issuerCuit: "30717611590",
    receptorIvaConditionId: 5,
    cbteFch: "20260722",
  };
}

async function annulRequest(formData: Record<string, string>) {
  const { request: seed } = await createSignedInAdminRequest({
    email: `comprobantes.anular.${crypto.randomUUID()}@example.com`,
    requestUrl: "http://localhost/administracion/comprobantes",
    role: "admin",
  });

  return new Request("http://localhost/administracion/comprobantes", {
    method: "POST",
    headers: {
      cookie: seed.headers.get("cookie") ?? "",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(formData),
  });
}

async function signedInAdminRequest() {
  const { request } = await createSignedInAdminRequest({
    email: `comprobantes.list.${crypto.randomUUID()}@example.com`,
    requestUrl: "http://localhost/administracion/comprobantes",
    role: "admin",
  });

  return request;
}

describe("loadAdminComprobantesList", () => {
  test("expone estado derivado, CAE y numeración de cada comprobante del evento activo", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const beta = await seedChoreography({
      academyName: "Academia Beta",
      catalog,
      email: `beta.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Beta",
    });
    const alfa = await seedChoreography({
      academyName: "Academia Alfa",
      catalog,
      email: `alfa.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Alfa",
    });

    const facturaAlfa = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        ptoVta: 3,
        cbteNro: 7,
        cae: "11112222333344",
        impTotal: 25000,
      }),
    );
    await recordComprobante(
      facturaCInput({
        choreographyId: beta.choreography.id,
        eventId: event.id,
        ptoVta: 3,
        cbteNro: 8,
        cae: "55556666777788",
      }),
    );
    // Nota de crédito C que anula la factura de Alfa.
    await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteTipo: 13,
        ptoVta: 3,
        cbteNro: 9,
        associatedComprobanteId: facturaAlfa.id,
      }),
    );

    const data = await loadAdminComprobantesList(await signedInAdminRequest());

    expect(data.selectedEventId).toBe(event.id);
    expect(data.rows).toHaveLength(3);

    const facturaAlfaRow = data.rows.find((row) => row.id === facturaAlfa.id);
    expect(facturaAlfaRow).toMatchObject({
      status: "anulada",
      cae: "11112222333344",
      ptoVta: 3,
      cbteNro: 7,
      cbteTipo: 11,
      impTotal: 25000,
      choreographyName: "Coreografía Alfa",
      academyName: "Academia Alfa",
    });

    const notaCreditoRow = data.rows.find((row) => row.cbteTipo === 13);
    expect(notaCreditoRow?.status).toBe("vigente");

    const facturaBetaRow = data.rows.find(
      (row) => row.cbteTipo === 11 && row.id !== facturaAlfa.id,
    );
    expect(facturaBetaRow?.status).toBe("vigente");
    expect(facturaBetaRow?.academyName).toBe("Academia Beta");
  });

  test("las facetas de academia se limitan a las academias con comprobantes, ordenadas por nombre", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const beta = await seedChoreography({
      academyName: "Academia Beta",
      catalog,
      email: `beta.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Beta",
    });
    const alfa = await seedChoreography({
      academyName: "Academia Alfa",
      catalog,
      email: `alfa.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Alfa",
    });
    // Academia sin comprobantes: no debería aparecer como faceta.
    await seedChoreography({
      academyName: "Academia Gamma",
      catalog,
      email: `gamma.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Gamma",
    });

    await recordComprobante(
      facturaCInput({
        choreographyId: beta.choreography.id,
        eventId: event.id,
        cbteNro: 1,
      }),
    );
    await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteNro: 2,
      }),
    );

    const data = await loadAdminComprobantesList(await signedInAdminRequest());

    expect(data.academyFacetOptions).toEqual([
      { label: "Academia Alfa", value: "Academia Alfa" },
      { label: "Academia Beta", value: "Academia Beta" },
    ]);
  });

  test("acota los comprobantes al evento activo: ignora los de otros eventos", async () => {
    const otherEvent = await createEventRecord({ active: false });
    const otherCatalog = await createEventCatalog(otherEvent.id);
    const otherChoreography = await seedChoreography({
      academyName: "Academia Otro Evento",
      catalog: otherCatalog,
      email: `otro.${crypto.randomUUID()}@example.com`,
      eventId: otherEvent.id,
      name: "Coreografía Otro Evento",
    });
    await recordComprobante(
      facturaCInput({
        choreographyId: otherChoreography.choreography.id,
        eventId: otherEvent.id,
        cbteNro: 100,
      }),
    );

    const activeEvent = await createEventRecord({ active: true });
    const activeCatalog = await createEventCatalog(activeEvent.id);
    const activeChoreography = await seedChoreography({
      academyName: "Academia Evento Activo",
      catalog: activeCatalog,
      email: `activo.${crypto.randomUUID()}@example.com`,
      eventId: activeEvent.id,
      name: "Coreografía Evento Activo",
    });
    await recordComprobante(
      facturaCInput({
        choreographyId: activeChoreography.choreography.id,
        eventId: activeEvent.id,
        cbteNro: 200,
      }),
    );

    const data = await loadAdminComprobantesList(await signedInAdminRequest());

    expect(data.selectedEventId).toBe(activeEvent.id);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]?.academyName).toBe("Academia Evento Activo");
  });

  test("sin evento activo devuelve una lista vacía sin facetas", async () => {
    await createEventRecord({ active: false });

    const data = await loadAdminComprobantesList(await signedInAdminRequest());

    expect(data.selectedEventId).toBeNull();
    expect(data.rows).toEqual([]);
    expect(data.academyFacetOptions).toEqual([]);
  });

  test("marca como anulable sólo la Factura C vigente", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const alfa = await seedChoreography({
      academyName: "Academia Anulable",
      catalog,
      email: `anulable.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Anulable",
    });

    const anulada = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteNro: 1,
      }),
    );
    const notaCredito = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteTipo: 13,
        cbteNro: 2,
        associatedComprobanteId: anulada.id,
      }),
    );
    const vigente = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteNro: 3,
      }),
    );

    const data = await loadAdminComprobantesList(await signedInAdminRequest());
    const byId = new Map(data.rows.map((row) => [row.id, row]));

    expect(byId.get(vigente.id)?.canAnnul).toBe(true);
    expect(byId.get(anulada.id)?.canAnnul).toBe(false);
    expect(byId.get(notaCredito.id)?.canAnnul).toBe(false);
  });
});

describe.sequential("handleAdminComprobantesListAction — anulación", () => {
  async function seedVigenteFactura() {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const academy = await seedChoreography({
      academyName: "Academia Anulación",
      catalog,
      email: `anulacion.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Anulación",
    });

    const factura = await recordComprobante(
      facturaCInput({
        choreographyId: academy.choreography.id,
        eventId: event.id,
        cbteNro: 42,
      }),
    );

    return { choreographyId: academy.choreography.id, factura };
  }

  test("anula el comprobante con su nota de crédito y se queda en la lista", async () => {
    const { choreographyId, factura } = await seedVigenteFactura();

    const result = await handleAdminComprobantesListAction({
      request: await annulRequest({
        intent: annulComprobanteIntent,
        confirm: annulComprobanteConfirmValue,
        comprobanteId: factura.id,
      }),
      resolveEmissionDeps: () => emissionDeps(fakeBilling()),
    });

    expect(result).toMatchObject({ status: "success" });

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, choreographyId));
    expect(stored).toHaveLength(2);
    expect(
      stored.find((row) => row.cbteTipo === 13)?.associatedComprobanteId,
    ).toBe(factura.id);
  });

  test("superficializa la contingencia de ARCA sin persistir nada", async () => {
    const { choreographyId, factura } = await seedVigenteFactura();

    const result = await handleAdminComprobantesListAction({
      request: await annulRequest({
        intent: annulComprobanteIntent,
        confirm: annulComprobanteConfirmValue,
        comprobanteId: factura.id,
      }),
      resolveEmissionDeps: () =>
        emissionDeps(
          fakeBilling({
            createVoucher: vi.fn(async () => facturaCRechazada),
          }),
        ),
    });

    expect(result).toMatchObject({ status: "annul-error" });
    if (result.status === "annul-error") {
      expect(result.contingency.resultado).toBe("R");
      expect(result.contingency.errors.length).toBeGreaterThan(0);
    }

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, choreographyId));
    expect(stored).toHaveLength(1);
  });

  test("se niega a anular sin la confirmación irreversible", async () => {
    const { choreographyId, factura } = await seedVigenteFactura();
    const billing = fakeBilling();

    const result = await handleAdminComprobantesListAction({
      request: await annulRequest({
        intent: annulComprobanteIntent,
        comprobanteId: factura.id,
      }),
      resolveEmissionDeps: () => emissionDeps(billing),
    });

    expect(result).toMatchObject({ status: "error" });
    expect(billing.createVoucher).not.toHaveBeenCalled();

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, choreographyId));
    expect(stored).toHaveLength(1);
  });

  test("no vuelve a anular un comprobante ya anulado", async () => {
    const { factura } = await seedVigenteFactura();
    const deps = () => emissionDeps(fakeBilling());

    await handleAdminComprobantesListAction({
      request: await annulRequest({
        intent: annulComprobanteIntent,
        confirm: annulComprobanteConfirmValue,
        comprobanteId: factura.id,
      }),
      resolveEmissionDeps: deps,
    });

    const second = await handleAdminComprobantesListAction({
      request: await annulRequest({
        intent: annulComprobanteIntent,
        confirm: annulComprobanteConfirmValue,
        comprobanteId: factura.id,
      }),
      resolveEmissionDeps: deps,
    });

    expect(second).toMatchObject({ status: "error" });
  });
});
