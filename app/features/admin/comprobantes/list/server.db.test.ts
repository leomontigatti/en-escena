import { describe, expect, test } from "vitest";

import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import {
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { loadAdminComprobantesList } from "@/features/admin/comprobantes/list/server";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

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

async function signedInAdminRequest(search = "") {
  const { request } = await createSignedInAdminRequest({
    email: `comprobantes.list.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/comprobantes${search}`,
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
        porcion: "seña",
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
      porcion: "seña",
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

  test("filtra por estado derivado: anulada devuelve la factura con Nota de crédito; vigente, el resto", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const alfa = await seedChoreography({
      academyName: "Academia Alfa",
      catalog,
      email: `alfa.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Alfa",
    });

    const anulada = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteNro: 1,
      }),
    );
    const vigente = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteNro: 2,
      }),
    );
    const notaCredito = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        cbteTipo: 13,
        cbteNro: 3,
        associatedComprobanteId: anulada.id,
      }),
    );

    const anuladas = await loadAdminComprobantesList(
      await signedInAdminRequest("?estado=anulada"),
    );
    expect(anuladas.rows.map((row) => row.id)).toEqual([anulada.id]);
    expect(anuladas.totalCount).toBe(1);

    const vigentes = await loadAdminComprobantesList(
      await signedInAdminRequest("?estado=vigente"),
    );
    expect(new Set(vigentes.rows.map((row) => row.id))).toEqual(
      new Set([vigente.id, notaCredito.id]),
    );
    expect(vigentes.totalCount).toBe(2);
  });

  test("filtra por tipo de comprobante", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const alfa = await seedChoreography({
      academyName: "Academia Alfa",
      catalog,
      email: `alfa.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Alfa",
    });

    const factura = await recordComprobante(
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
        associatedComprobanteId: factura.id,
      }),
    );

    const notas = await loadAdminComprobantesList(
      await signedInAdminRequest("?tipo=nota_credito_c"),
    );
    expect(notas.rows.map((row) => row.id)).toEqual([notaCredito.id]);

    const facturas = await loadAdminComprobantesList(
      await signedInAdminRequest("?tipo=factura_c"),
    );
    expect(facturas.rows.map((row) => row.id)).toEqual([factura.id]);
  });

  test("busca por academia, coreografía y número de comprobante", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const alfa = await seedChoreography({
      academyName: "Academia Alfa",
      catalog,
      email: `alfa.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Tango",
    });
    const beta = await seedChoreography({
      academyName: "Academia Beta",
      catalog,
      email: `beta.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Vals",
    });

    const facturaAlfa = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        ptoVta: 1,
        cbteNro: 1,
      }),
    );
    const facturaBeta = await recordComprobante(
      facturaCInput({
        choreographyId: beta.choreography.id,
        eventId: event.id,
        ptoVta: 1,
        cbteNro: 2,
      }),
    );

    // Por academia.
    const porAcademia = await loadAdminComprobantesList(
      await signedInAdminRequest("?busqueda=Academia+Alfa"),
    );
    expect(porAcademia.rows.map((row) => row.id)).toEqual([facturaAlfa.id]);

    // Por coreografía (el nombre no coincide con la academia).
    const porCoreografia = await loadAdminComprobantesList(
      await signedInAdminRequest("?busqueda=Vals"),
    );
    expect(porCoreografia.rows.map((row) => row.id)).toEqual([facturaBeta.id]);

    // Por número fiscal formateado.
    const porNumero = await loadAdminComprobantesList(
      await signedInAdminRequest("?busqueda=0001-00000002"),
    );
    expect(porNumero.rows.map((row) => row.id)).toEqual([facturaBeta.id]);
  });

  test("ordena por número ascendente cuando se pide", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const alfa = await seedChoreography({
      academyName: "Academia Alfa",
      catalog,
      email: `alfa.${crypto.randomUUID()}@example.com`,
      eventId: event.id,
      name: "Coreografía Alfa",
    });

    const primero = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        ptoVta: 1,
        cbteNro: 1,
      }),
    );
    const segundo = await recordComprobante(
      facturaCInput({
        choreographyId: alfa.choreography.id,
        eventId: event.id,
        ptoVta: 1,
        cbteNro: 2,
      }),
    );

    const data = await loadAdminComprobantesList(
      await signedInAdminRequest("?orden=numero:asc"),
    );

    expect(data.rows.map((row) => row.id)).toEqual([primero.id, segundo.id]);
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

  test("sin evento activo devuelve una lista vacía", async () => {
    await createEventRecord({ active: false });

    const data = await loadAdminComprobantesList(await signedInAdminRequest());

    expect(data.selectedEventId).toBeNull();
    expect(data.rows).toEqual([]);
    expect(data.totalCount).toBe(0);
    expect(data.hasAnyComprobante).toBe(false);
  });
});
