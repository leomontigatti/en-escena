import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  modalities,
  submodalities,
} from "@/db/schema";
import {
  handleAdministrativeChoreographyDetailAction,
  loadAdministrativeChoreographyDetailRouteData,
} from "@/features/admin/choreographies/detail/server";
import {
  deleteAdministrativeChoreographyIntent,
  renameAdministrativeChoreographyIntent,
  updateAdministrativeChoreographySubmodalityIntent,
} from "@/features/admin/choreographies/detail/shared";
import {
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
  date,
} from "@/features/portal/choreographies/test-support/db";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administrative choreography detail server", () => {
  test("allows admin and auditor access, blocks non-admin-panel roles, and only resolves active-event choreographies", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Detalle",
      email: "admin.coreografias.detalle.academia@example.com",
    });
    const activeEvent = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const inactiveEvent = await createEventRecord({
      active: false,
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    const activeCatalog = await createEventCatalog(activeEvent.id);
    const inactiveCatalog = await createEventCatalog(inactiveEvent.id);
    const activeChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: activeCatalog.categoryWithLevel.id,
      eventId: activeEvent.id,
      experienceLevelId: activeCatalog.level.id,
      modalityId: activeCatalog.modality.id,
      name: "Activa",
      scheduleCapacityId: activeCatalog.scheduleCapacity.id,
      submodalityId: activeCatalog.submodality.id,
    });
    const inactiveChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: inactiveCatalog.categoryWithLevel.id,
      eventId: inactiveEvent.id,
      experienceLevelId: inactiveCatalog.level.id,
      modalityId: inactiveCatalog.modality.id,
      name: "Histórica",
      scheduleCapacityId: inactiveCatalog.scheduleCapacity.id,
      submodalityId: inactiveCatalog.submodality.id,
    });

    const adminData = await loadDetail({
      choreographyId: activeChoreography.id,
      email: "admin.coreografias.detalle@example.com",
      role: "admin",
    });
    const auditorData = await loadDetail({
      choreographyId: activeChoreography.id,
      email: "auditor.coreografias.detalle@example.com",
      role: "auditor",
    });

    expect(adminData.canEdit).toBe(true);
    expect(auditorData.canEdit).toBe(false);
    expect(adminData.selectedEventId).toBe(activeEvent.id);
    expect(adminData.choreography).toMatchObject({
      academyName: "Academia Detalle",
      id: activeChoreography.id,
      name: "Activa",
    });

    await expectThrownResponse(
      loadDetail({
        choreographyId: activeChoreography.id,
        email: "academy.coreografias.detalle@example.com",
        role: "academy",
      }),
      403,
    );
    await expectThrownResponse(
      loadDetail({
        choreographyId: activeChoreography.id,
        email: "judge.coreografias.detalle@example.com",
        role: "judge",
      }),
      403,
    );
    await expectThrownResponse(
      loadDetail({
        choreographyId: inactiveChoreography.id,
        email: "admin.coreografias.detalle.inactiva@example.com",
        role: "admin",
      }),
      404,
    );
  });

  test("renames active-event choreographies for admins even when presentation blockers exist", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Renombre",
      email: "admin.coreografias.renombre.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      hasPresentation: true,
      modalityId: catalog.modality.id,
      name: "Nombre anterior",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const response = await submitDetailAction({
      body: renameFormData("Nombre nuevo"),
      choreographyId: choreography.id,
      email: "admin.coreografias.renombre@example.com",
      role: "admin",
    });

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { name: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ name: "Nombre nuevo" });

    await expectThrownResponse(
      submitDetailAction({
        body: renameFormData("Intento auditor"),
        choreographyId: choreography.id,
        email: "auditor.coreografias.renombre@example.com",
        role: "auditor",
      }),
      403,
    );
    await expect(
      db.query.choreographies.findFirst({
        columns: { name: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ name: "Nombre nuevo" });
  });

  test("deletes eligible active-event choreographies and cascades roster links", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Eliminar",
      email: "admin.coreografias.eliminar.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
    });
    const professor = await createProfessor(owner.academyId, {
      firstName: "Luz",
      lastName: "Suárez",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Sin bloqueos",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const response = await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.eliminar@example.com",
      role: "admin",
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(response.status).toBe(302);
    await expectFlashRedirect(response, "/administracion/coreografias", {
      id: "route-notification:coreografia-eliminada",
      message: "Coreografía eliminada.",
      variant: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
  });

  test("blocks admin deletion with concrete presentation reasons", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Bloqueos",
      email: "admin.coreografias.bloqueos.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const presentationBlocked = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      hasPresentation: true,
      modalityId: catalog.modality.id,
      name: "Presentada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    await expect(loadDeleteBlockers(presentationBlocked.id)).resolves.toEqual([
      "presentation",
    ]);
    await expectThrownResponse(
      submitDetailAction({
        body: deleteFormData(),
        choreographyId: presentationBlocked.id,
        email: "admin.coreografias.bloqueo.presentacion@example.com",
        role: "admin",
      }),
      409,
    );
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, presentationBlocked.id),
      }),
    ).resolves.toBeDefined();
  });

  test("blocks admin deletion of a choreography with ARCA comprobantes, even once annulled by a credit note", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Fiscal",
      email: "admin.coreografias.fiscal.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const invoiced = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Facturada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const factura = await recordComprobante(
      facturaCInput({ choreographyId: invoiced.id, eventId: event.id }),
    );

    // Sólo la existencia de la Factura C ya bloquea el borrado físico.
    await expect(loadDeleteBlockers(invoiced.id)).resolves.toEqual([
      "comprobantes",
    ]);
    await expectThrownResponse(
      submitDetailAction({
        body: deleteFormData(),
        choreographyId: invoiced.id,
        email: "admin.coreografias.bloqueo.comprobantes@example.com",
        role: "admin",
      }),
      409,
    );

    // Anular con una Nota de crédito no libera el bloqueo: la historia fiscal
    // persiste (la factura anulada + la NC siguen ancladas a la coreografía).
    await recordComprobante(
      facturaCInput({
        choreographyId: invoiced.id,
        eventId: event.id,
        cbteTipo: 13,
        cbteNro: 1,
        associatedComprobanteId: factura.id,
      }),
    );

    await expectThrownResponse(
      submitDetailAction({
        body: deleteFormData(),
        choreographyId: invoiced.id,
        email: "admin.coreografias.bloqueo.comprobantes.nc@example.com",
        role: "admin",
      }),
      409,
    );

    // La coreografía nunca se borró pese a los dos intentos.
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, invoiced.id),
      }),
    ).resolves.toBeDefined();
  });

  test("updates the submodality within the same modality for admins and bumps updatedAt", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad",
      email: "admin.coreografias.submodalidad.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const otherSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Contemporáneo",
    });
    const staleUpdatedAt = date("2026-01-01T12:00:00Z");
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Con submodalidad",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
      updatedAt: staleUpdatedAt,
    });

    const response = await submitDetailAction({
      body: submodalityFormData(otherSubmodality.id),
      choreographyId: choreography.id,
      email: "admin.coreografias.submodalidad@example.com",
      role: "admin",
    });

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });

    const stored = await db.query.choreographies.findFirst({
      columns: { submodalityId: true, updatedAt: true },
      where: eq(choreographies.id, choreography.id),
    });
    expect(stored?.submodalityId).toBe(otherSubmodality.id);
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(
      staleUpdatedAt.getTime(),
    );
  });

  test("rejects a submodality that does not belong to the choreography's modality", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad Ajena",
      email: "admin.coreografias.submodalidad.ajena.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const foreignModality = await createModalityRecord({
      eventId: event.id,
      name: "Urbano",
    });
    const foreignSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: foreignModality.id,
      name: "Hip Hop",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Submodalidad ajena",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const result = await submitDetailAction({
      body: submodalityFormData(foreignSubmodality.id),
      choreographyId: choreography.id,
      email: "admin.coreografias.submodalidad.ajena@example.com",
      role: "admin",
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ status: "error" });
    await expect(
      db.query.choreographies.findFirst({
        columns: { submodalityId: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ submodalityId: catalog.submodality.id });
  });

  test("rejects leaving the submodality blank when the modality has submodalities", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad Vacía",
      email: "admin.coreografias.submodalidad.vacia.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Submodalidad vacía",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const result = await submitDetailAction({
      body: submodalityFormData(""),
      choreographyId: choreography.id,
      email: "admin.coreografias.submodalidad.vacia@example.com",
      role: "admin",
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ status: "error" });
    await expect(
      db.query.choreographies.findFirst({
        columns: { submodalityId: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ submodalityId: catalog.submodality.id });
  });

  test("keeps the submodality read-only when the choreography has a presentation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad Presentada",
      email: "admin.coreografias.submodalidad.presentada.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const otherSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Contemporáneo",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      hasPresentation: true,
      modalityId: catalog.modality.id,
      name: "Presentada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const result = await submitDetailAction({
      body: submodalityFormData(otherSubmodality.id),
      choreographyId: choreography.id,
      email: "admin.coreografias.submodalidad.presentada@example.com",
      role: "admin",
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ status: "error" });
    await expect(
      db.query.choreographies.findFirst({
        columns: { submodalityId: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ submodalityId: catalog.submodality.id });
  });

  test("blocks auditors from updating the submodality", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad Auditor",
      email: "admin.coreografias.submodalidad.auditor.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const otherSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Contemporáneo",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Auditor",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    await expectThrownResponse(
      submitDetailAction({
        body: submodalityFormData(otherSubmodality.id),
        choreographyId: choreography.id,
        email: "auditor.coreografias.submodalidad@example.com",
        role: "auditor",
      }),
      403,
    );
    await expect(
      db.query.choreographies.findFirst({
        columns: { submodalityId: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ submodalityId: catalog.submodality.id });
  });
});

async function createModalityRecord(input: { eventId: string; name: string }) {
  const [modality] = await db
    .insert(modalities)
    .values({ eventId: input.eventId, name: input.name })
    .returning();

  return modality;
}

async function createSubmodalityRecord(input: {
  eventId: string;
  modalityId: string;
  name: string;
}) {
  const [submodality] = await db
    .insert(submodalities)
    .values({
      eventId: input.eventId,
      modalityId: input.modalityId,
      name: input.name,
    })
    .returning();

  return submodality;
}

function submodalityFormData(submodalityId: string) {
  const formData = new FormData();
  formData.set("intent", updateAdministrativeChoreographySubmodalityIntent);
  formData.set("submodalityId", submodalityId);
  return formData;
}

async function loadDeleteBlockers(choreographyId: string) {
  const data = await loadDetail({
    choreographyId,
    email: `admin.coreografias.bloqueos.${choreographyId}@example.com`,
    role: "admin",
  });

  return data.deletion.blockers.map((blocker) => blocker.code);
}

async function loadDetail(input: {
  choreographyId: string;
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
}) {
  const { request } = await createSignedInAdminRequest({
    email: input.email,
    requestUrl: `http://localhost/administracion/coreografias/${input.choreographyId}`,
    role: input.role,
  });

  return await loadAdministrativeChoreographyDetailRouteData({
    params: { choreographyId: input.choreographyId },
    request,
  });
}

async function submitDetailAction(input: {
  body: FormData;
  choreographyId: string;
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
}) {
  const { request } = await createSignedInAdminRequest({
    body: input.body,
    email: input.email,
    requestUrl: `http://localhost/administracion/coreografias/${input.choreographyId}`,
    role: input.role,
  });

  return await handleAdministrativeChoreographyDetailAction({
    params: { choreographyId: input.choreographyId },
    request,
  });
}

function renameFormData(name: string) {
  const formData = new FormData();
  formData.set("intent", renameAdministrativeChoreographyIntent);
  formData.set("name", name);
  return formData;
}

function deleteFormData() {
  const formData = new FormData();
  formData.set("intent", deleteAdministrativeChoreographyIntent);
  return formData;
}

// Snapshot de Factura C a consumidor final anónimo del emisor exento; los
// overrides permiten derivar la NC espejo (cbteTipo 13 + associatedComprobanteId).
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
