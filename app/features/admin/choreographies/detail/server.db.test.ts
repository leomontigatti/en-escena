import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
} from "@/db/schema";
import {
  handleAdministrativeChoreographyDetailAction,
  loadAdministrativeChoreographyDetailRouteData,
} from "@/features/admin/choreographies/detail/server";
import {
  deleteAdministrativeChoreographyIntent,
  renameAdministrativeChoreographyIntent,
} from "@/features/admin/choreographies/detail/shared";
import {
  createAcademySession,
  createChoreographyRecord,
  createDepositInvoiceRecord,
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

  test("renames active-event choreographies for admins even when financial or presentation blockers exist", async () => {
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
    await createDepositInvoiceRecord({
      academyId: owner.academyId,
      choreographyId: choreography.id,
      createdByUserId: owner.userId,
      eventId: event.id,
    });

    const response = await submitDetailAction({
      body: renameFormData("Nombre nuevo"),
      choreographyId: choreography.id,
      email: "admin.coreografias.renombre@example.com",
      role: "admin",
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/administracion/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
    );
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
    expect(response.headers.get("location")).toBe(
      "/administracion/coreografias?notificacion=coreografia-eliminada",
    );
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

  test("blocks admin deletion with concrete invoice and presentation reasons", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Bloqueos",
      email: "admin.coreografias.bloqueos.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const invoiceBlocked = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Factura cancelada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
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
    const invoice = await createDepositInvoiceRecord({
      academyId: owner.academyId,
      choreographyId: invoiceBlocked.id,
      createdByUserId: owner.userId,
      eventId: event.id,
    });
    await db
      .update(academyEventChoreographyInvoices)
      .set({ cancelledAt: new Date("2026-04-01T12:00:00Z") })
      .where(eq(academyEventChoreographyInvoices.id, invoice.id));

    await expect(loadDeleteBlockers(invoiceBlocked.id)).resolves.toEqual([
      "invoices",
    ]);
    await expect(loadDeleteBlockers(presentationBlocked.id)).resolves.toEqual([
      "presentation",
    ]);
    await expectThrownResponse(
      submitDetailAction({
        body: deleteFormData(),
        choreographyId: invoiceBlocked.id,
        email: "admin.coreografias.bloqueo.factura@example.com",
        role: "admin",
      }),
      409,
    );
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
        where: eq(choreographies.id, invoiceBlocked.id),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, presentationBlocked.id),
      }),
    ).resolves.toBeDefined();
  });
});

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
