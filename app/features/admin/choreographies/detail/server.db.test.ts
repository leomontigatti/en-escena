import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  modalities,
  scheduleCapacities,
  schedules,
  submodalities,
} from "@/db/schema";
import {
  handleChoreographyDetailAction,
  loadChoreographyDetailRouteData,
} from "@/features/admin/choreographies/detail/server";
import {
  assignedScheduleCapacityFieldName,
  deleteChoreographyIntent,
  renameChoreographyIntent,
  updateChoreographyScheduleCapacityIntent,
  updateChoreographySubmodalityIntent,
} from "@/features/admin/choreographies/detail/shared";
import {
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
  date,
  freezeInscriptionDepositForTest,
} from "@/features/portal/choreographies/test-support/db";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";
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

  test("reassigns the cupo de cronograma to another compatible cronograma", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma",
      slug: "cronograma",
    });
    const staleUpdatedAt = date("2026-01-01T12:00:00Z");
    await db
      .update(choreographies)
      .set({ updatedAt: staleUpdatedAt })
      .where(eq(choreographies.id, scenario.choreography.id));

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });

    const stored = await db.query.choreographies.findFirst({
      columns: {
        scheduleCapacityId: true,
        scheduleId: true,
        updatedAt: true,
      },
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(stored?.scheduleCapacityId).toBe(
      scenario.target.scheduleCapacity.id,
    );
    expect(stored?.scheduleId).toBe(scenario.target.schedule.id);
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(
      staleUpdatedAt.getTime(),
    );
  });

  test("rejects a cupo de cronograma that is not compatible, whatever the form sent", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Incompatible",
      slug: "cronograma.incompatible",
    });
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const foreign = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });

    const result = await scenario.reassignTo(foreign.scheduleCapacity.id);

    expect(result).toMatchObject({ status: "error" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
  });

  test("blocks the reassignment when the choreography has a presentation", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Presentada",
      hasPresentation: true,
      slug: "cronograma.presentada",
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "error" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
  });

  // El cupo puntual con lugar no alcanza: la capacidad total del cronograma
  // que lo contiene es una segunda barrera, y la reasignación tiene que
  // chocarla igual que el registro.
  test("rejects a target cupo with room when its cronograma is already full", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Total Lleno",
      slug: "cronograma.total.lleno",
    });
    await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Ocupante",
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });
    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, scenario.target.schedule.id));

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.total.lleno.detalle@example.com",
      role: "admin",
    });
    const target = detail.scheduleCapacity.options.find(
      (option) => option.id === scenario.target.scheduleCapacity.id,
    );
    // El cupo puntual dice 1/5 y aun así se ofrece deshabilitado: la vista no
    // puede prometer lugar donde el intent va a rechazar.
    expect(target?.label).toContain("1/5 ocupados · sin cupo");
    expect(target?.isFull).toBe(true);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message: "El cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
  });

  // La seña puede aparecer entre que el loader abrió el campo y que el intent
  // corre: la guarda se revalida dentro de la transacción, no antes de ella.
  test("blocks a reassignment whose seña was registered after the field was open", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Seña Tardía",
      slug: "cronograma.senia.tardia",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.senia.tardia.detalle@example.com",
      role: "admin",
    });
    expect(detail.scheduleCapacity.canReassign).toBe(true);

    await freezeInscriptionDepositForTest({
      academyId: scenario.owner.academyId,
      choreographyId: scenario.choreography.id,
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message:
        "No se puede cambiar el cupo de cronograma: hay inscripciones con seña registrada.",
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
  });

  test("rejects a target cupo de cronograma that is already full", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Lleno",
      slug: "cronograma.lleno",
      targetCapacity: 1,
    });
    await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Ocupante",
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message:
        "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
  });

  test("re-selecting the cupo the choreography already occupies succeeds even at capacity", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Sin Cambios",
      slug: "cronograma.sin.cambios",
    });
    // El cupo queda lleno con la propia coreografía: sin la exclusión, elegir
    // el cupo ya asignado se rechazaría por falta de lugar.
    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(eq(scheduleCapacities.id, scenario.catalog.scheduleCapacity.id));

    const result = await scenario.reassignTo(
      scenario.catalog.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  test("lets a single choreography into a cupo with one slot when two are reassigned at once", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Concurrente",
      slug: "cronograma.concurrente",
      targetCapacity: 1,
    });
    const rival = await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Rival",
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });

    const results = await Promise.all([
      scenario.reassignTo(scenario.target.scheduleCapacity.id, {
        sessionKey: "primera",
      }),
      scenario.reassignTo(scenario.target.scheduleCapacity.id, {
        choreographyId: rival.id,
        sessionKey: "segunda",
      }),
    ]);

    const statuses = results.map((result) =>
      result instanceof Response || !("status" in result)
        ? "unexpected"
        : result.status,
    );
    expect(statuses.filter((status) => status === "success")).toHaveLength(1);
    expect(statuses.filter((status) => status === "error")).toHaveLength(1);

    const occupants = await db
      .select({ id: choreographies.id })
      .from(choreographies)
      .where(
        eq(
          choreographies.scheduleCapacityId,
          scenario.target.scheduleCapacity.id,
        ),
      );
    expect(occupants).toHaveLength(1);
  });

  test("keeps the assigned cupo in the options and locks the field with a single compatible one", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Opciones",
      slug: "cronograma.opciones",
    });

    const multiple = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.opciones.multiple@example.com",
      role: "admin",
    });
    expect(multiple.scheduleCapacity.canReassign).toBe(true);
    expect(
      multiple.scheduleCapacity.options.map((option) => option.id),
    ).toEqual(
      expect.arrayContaining([
        scenario.catalog.scheduleCapacity.id,
        scenario.target.scheduleCapacity.id,
      ]),
    );

    // Con el cupo asignado fuera de la compatibilidad, la opción vigente sigue
    // en la lista aunque el campo quede bloqueado por falta de alternativas.
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const drifted = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });
    await db
      .delete(schedules)
      .where(eq(schedules.id, scenario.target.schedule.id));
    await db
      .update(choreographies)
      .set({
        scheduleCapacityId: drifted.scheduleCapacity.id,
        scheduleId: null,
      })
      .where(eq(choreographies.id, scenario.choreography.id));

    const single = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.opciones.single@example.com",
      role: "admin",
    });
    expect(single.scheduleCapacity.canReassign).toBe(false);
    expect(
      single.scheduleCapacity.options.map((option) => option.id),
    ).toContain(drifted.scheduleCapacity.id);
  });

  test("shows the occupancy in the cupo options and marks the full ones", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Ocupación",
      slug: "cronograma.ocupacion",
      targetCapacity: 1,
    });
    await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Ocupante",
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.ocupacion.detalle@example.com",
      role: "admin",
    });
    const assigned = detail.scheduleCapacity.options.find(
      (option) => option.id === scenario.catalog.scheduleCapacity.id,
    );
    const target = detail.scheduleCapacity.options.find(
      (option) => option.id === scenario.target.scheduleCapacity.id,
    );

    // La coreografía que se está moviendo no cuenta contra el cupo que ya
    // ocupa: su propia opción no puede verse llena.
    expect(assigned?.isFull).toBe(false);
    expect(assigned?.label).toContain("0/5 ocupados");
    expect(target?.isFull).toBe(true);
    expect(target?.label).toContain("1/1 ocupados · sin cupo");
    // La etiqueta del cronograma asignado sigue sin ocupación.
    expect(detail.choreography.scheduleLabel).not.toContain("ocupados");
  });

  test("blocks the reassignment when an inscription has a frozen deposit", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Señada",
      slug: "cronograma.senada",
    });
    await freezeInscriptionDepositForTest({
      academyId: scenario.owner.academyId,
      choreographyId: scenario.choreography.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.senada.detalle@example.com",
      role: "admin",
    });
    expect(detail.scheduleCapacity.canReassign).toBe(false);
    expect(detail.scheduleCapacity.blockers).toEqual([
      {
        code: "frozen-deposit",
        label: expect.stringContaining("seña registrada"),
      },
    ]);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message:
        "No se puede cambiar el cupo de cronograma: hay inscripciones con seña registrada.",
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
  });

  test("reassigns when the inscriptions carry no deposit snapshot", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Impaga",
      slug: "cronograma.impaga",
    });
    const dancer = await createDancer(scenario.owner.academyId, {
      firstName: "Sol",
      lastName: "Rivas",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: scenario.choreography.id,
      dancerId: dancer.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.impaga.detalle@example.com",
      role: "admin",
    });
    expect(detail.scheduleCapacity.blockers).toEqual([]);
    expect(detail.scheduleCapacity.canReassign).toBe(true);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      scheduleId: scenario.target.schedule.id,
    });
  });

  test("shows the frozen-deposit blocker to auditors as well", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Señada Auditor",
      slug: "cronograma.senada.auditor",
    });
    await freezeInscriptionDepositForTest({
      academyId: scenario.owner.academyId,
      choreographyId: scenario.choreography.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "auditor.coreografias.cronograma.senada@example.com",
      role: "auditor",
    });

    expect(
      detail.scheduleCapacity.blockers.map((blocker) => blocker.code),
    ).toEqual(["frozen-deposit"]);
  });

  test("blocks auditors from reassigning the cupo de cronograma", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Auditor",
      slug: "cronograma.auditor",
    });

    await expectThrownResponse(
      submitDetailAction({
        body: scheduleCapacityFormData(scenario.target.scheduleCapacity.id),
        choreographyId: scenario.choreography.id,
        email: "auditor.coreografias.cronograma@example.com",
        role: "auditor",
      }),
      403,
    );
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: null,
    });
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

async function createScheduleWithSoloCapacity(input: {
  capacity?: number;
  eventId: string;
  modalityId: string;
}) {
  const schedule = await createScheduleForModalityFixture({
    eventId: input.eventId,
    modalityId: input.modalityId,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
      capacity: input.capacity ?? 5,
    })
    .returning();

  return { schedule, scheduleCapacity };
}

/**
 * Una coreografía registrada en el cupo del catálogo y un segundo cronograma
 * compatible al que reasignarla: el mínimo para que la resolución sea
 * `multiple` y el campo esté habilitado.
 */
async function createScheduleCapacityScenario(input: {
  academyName: string;
  hasPresentation?: boolean;
  slug: string;
  targetCapacity?: number;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: `admin.coreografias.${input.slug}.academia@example.com`,
  });
  const event = await createEventRecord({
    active: true,
    name: "Regional 2026",
  });
  const catalog = await createEventCatalog(event.id);
  const target = await createScheduleWithSoloCapacity({
    capacity: input.targetCapacity,
    eventId: event.id,
    modalityId: catalog.modality.id,
  });
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    hasPresentation: input.hasPresentation ?? false,
    modalityId: catalog.modality.id,
    name: "Con cronograma",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  return {
    catalog,
    choreography,
    event,
    owner,
    async readAssignment(choreographyId = choreography.id) {
      return await db.query.choreographies.findFirst({
        columns: { scheduleCapacityId: true, scheduleId: true },
        where: eq(choreographies.id, choreographyId),
      });
    },
    async reassignTo(
      optionId: string,
      options: { choreographyId?: string; sessionKey?: string } = {},
    ) {
      const sessionKey = options.sessionKey ? `.${options.sessionKey}` : "";

      return await submitDetailAction({
        body: scheduleCapacityFormData(optionId),
        choreographyId: options.choreographyId ?? choreography.id,
        email: `admin.coreografias.${input.slug}${sessionKey}@example.com`,
        role: "admin",
      });
    },
    target,
  };
}

function scheduleCapacityFormData(optionId: string) {
  const formData = new FormData();
  formData.set("intent", updateChoreographyScheduleCapacityIntent);
  formData.set(assignedScheduleCapacityFieldName, optionId);
  return formData;
}

function submodalityFormData(submodalityId: string) {
  const formData = new FormData();
  formData.set("intent", updateChoreographySubmodalityIntent);
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

  return await loadChoreographyDetailRouteData({
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

  return await handleChoreographyDetailAction({
    params: { choreographyId: input.choreographyId },
    request,
  });
}

function renameFormData(name: string) {
  const formData = new FormData();
  formData.set("intent", renameChoreographyIntent);
  formData.set("name", name);
  return formData;
}

function deleteFormData() {
  const formData = new FormData();
  formData.set("intent", deleteChoreographyIntent);
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
