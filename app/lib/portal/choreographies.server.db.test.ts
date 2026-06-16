import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  experienceLevels,
  modalities,
  professors,
  scheduleBlockModalities,
  scheduleBlocks,
  scheduleEntries,
  submodalities,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import { action as choreographyDetailAction } from "@/routes/portal.coreografias_.$choreographyId";
import { loader as choreographyDetailLoader } from "@/routes/portal.coreografias_.$choreographyId";
import { loader as choreographiesLoader } from "@/routes/portal.coreografias";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreographies reads", () => {
  test("lists only the authenticated Academia choreographies for the active Evento and derives operational pending items", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena",
      email: "coreografias.other@example.com",
    });
    const selectedEvent = await createEventRecord({
      active: true,
      name: "Regional 2025",
      startsAt: date("2025-10-10T12:00:00Z"),
      endsAt: date("2025-10-12T12:00:00Z"),
    });
    const activeEvent = await createEventRecord({
      active: false,
      name: "Regional 2026",
      startsAt: date("2026-10-10T12:00:00Z"),
      endsAt: date("2026-10-12T12:00:00Z"),
    });
    const selectedCatalog = await createEventCatalog(selectedEvent.id);
    const ownerDancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
    });
    const ownerProfessor = await createProfessor(owner.academyId, {
      firstName: "Lucía",
      lastName: "Suárez",
    });

    const completeChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: selectedCatalog.level.id,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/complete.mp3",
      name: "Final Completa",
      scheduleEntryId: selectedCatalog.scheduleEntry.id,
      submodalityId: selectedCatalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: completeChoreography.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: completeChoreography.id,
      professorId: ownerProfessor.id,
    });

    const missingMusic = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: selectedCatalog.level.id,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: null,
      name: "Sin Música",
      scheduleEntryId: selectedCatalog.scheduleEntry.id,
      submodalityId: selectedCatalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingMusic.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: missingMusic.id,
      professorId: ownerProfessor.id,
    });

    const missingCategory = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: null,
      eventId: selectedEvent.id,
      experienceLevelId: null,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/category.mp3",
      name: "Sin Categoría",
      scheduleEntryId: selectedCatalog.scheduleEntry.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingCategory.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: missingCategory.id,
      professorId: ownerProfessor.id,
    });

    const missingLevel = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: null,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/level.mp3",
      name: "Sin Nivel",
      scheduleEntryId: selectedCatalog.scheduleEntry.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingLevel.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: missingLevel.id,
      professorId: ownerProfessor.id,
    });

    const missingProfessors = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithoutLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: null,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/profesores.mp3",
      name: "Sin Profesores",
      scheduleEntryId: selectedCatalog.scheduleEntry.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingProfessors.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });

    const otherEventCatalog = await createEventCatalog(activeEvent.id);
    const ownerOtherEvent = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: otherEventCatalog.categoryWithLevel.id,
      eventId: activeEvent.id,
      experienceLevelId: otherEventCatalog.level.id,
      modalityId: otherEventCatalog.modality.id,
      musicStorageKey: "music/other-event.mp3",
      name: "Otro Evento",
      scheduleEntryId: otherEventCatalog.scheduleEntry.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: ownerOtherEvent.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 14,
    });

    const otherAcademyDancer = await createDancer(other.academyId, {
      firstName: "Beto",
      lastName: "Ruiz",
      birthDate: "2011-03-04",
    });
    const otherAcademyChoreography = await createChoreographyRecord({
      academyId: other.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: selectedCatalog.level.id,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/other-academy.mp3",
      name: "Otra Academia",
      scheduleEntryId: selectedCatalog.scheduleEntry.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: otherAcademyChoreography.id,
      dancerId: otherAcademyDancer.id,
      ageAtEventStart: 14,
    });

    const loaderData = await choreographiesLoader({
      request: new Request(
        `http://localhost/portal/coreografias?evento=${selectedEvent.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(loaderData.choreographies.map((row) => row.name)).toEqual([
      "Sin Profesores",
      "Sin Nivel",
      "Sin Categoría",
      "Sin Música",
      "Final Completa",
    ]);
    expect(loaderData.choreographies).toMatchObject([
      {
        name: "Sin Profesores",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["professors"],
        },
      },
      {
        name: "Sin Nivel",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["experienceLevel"],
        },
      },
      {
        name: "Sin Categoría",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["category"],
        },
      },
      {
        name: "Sin Música",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["music"],
        },
      },
      {
        name: "Final Completa",
        operationalStatus: {
          code: "complete",
          pendingItems: [],
        },
      },
    ]);
  });

  test("shows detail only for the authenticated Academia inside the selected Evento and includes archived linked people", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena",
      email: "coreografias.detail.other@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const archivedDancer = await createDancer(owner.academyId, {
      active: false,
      firstName: "Ana",
      lastName: "Archivada",
      birthDate: "2010-02-03",
    });
    const archivedProfessor = await createProfessor(owner.academyId, {
      active: false,
      firstName: "Luz",
      lastName: "Archivada",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail.mp3",
      name: "Detalle Histórico",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: archivedDancer.id,
      ageAtEventStart: 16,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: archivedProfessor.id,
    });

    const ownerDetail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(ownerDetail.choreography).toMatchObject({
      id: choreography.id,
      name: "Detalle Histórico",
      dancers: [
        {
          firstName: "Ana",
          lastName: "Archivada",
          active: false,
          ageAtEventStart: 16,
        },
      ],
      professors: [
        {
          firstName: "Luz",
          lastName: "Archivada",
          active: false,
        },
      ],
    });

    await expect(
      choreographyDetailLoader({
        params: { choreographyId: choreography.id },
        request: new Request(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
          {
            headers: { cookie: other.cookie },
          },
        ),
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  test("derives dancer editing eligibility for detail with priority: presentación, vínculo financiero activo, inscripción cerrada", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.dancer-eligibility@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationEndsAt: date("2000-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-04-05",
    });

    const registrationClosedChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail-registration-closed.mp3",
      name: "Inscripción cerrada",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    const financialBlockedChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      hasActiveFinancialLink: true,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail-financial.mp3",
      name: "Financiera",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    const presentationBlockedChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      hasActiveFinancialLink: true,
      hasPresentation: true,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail-presentation.mp3",
      name: "Presentada",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });

    await db.insert(choreographyDancers).values([
      {
        choreographyId: registrationClosedChoreography.id,
        dancerId: dancer.id,
        ageAtEventStart: 15,
      },
      {
        choreographyId: financialBlockedChoreography.id,
        dancerId: dancer.id,
        ageAtEventStart: 15,
      },
      {
        choreographyId: presentationBlockedChoreography.id,
        dancerId: dancer.id,
        ageAtEventStart: 15,
      },
    ]);

    const registrationClosedDetail = await choreographyDetailLoader({
      params: { choreographyId: registrationClosedChoreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${registrationClosedChoreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });
    const financialBlockedDetail = await choreographyDetailLoader({
      params: { choreographyId: financialBlockedChoreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${financialBlockedChoreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });
    const presentationBlockedDetail = await choreographyDetailLoader({
      params: { choreographyId: presentationBlockedChoreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${presentationBlockedChoreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(registrationClosedDetail.dancerEditingEligibility).toEqual({
      canEdit: false,
      reasonCode: "registration-closed",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque el período de inscripción está cerrado.",
    });
    expect(financialBlockedDetail.dancerEditingEligibility).toEqual({
      canEdit: false,
      reasonCode: "active-financial-link",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque tiene un vínculo financiero activo.",
    });
    expect(presentationBlockedDetail.dancerEditingEligibility).toEqual({
      canEdit: false,
      reasonCode: "presentation",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    });
  });

  test("marks dancer editing as available while registration is open and there are no blockers", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.dancer-eligibility-open@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationEndsAt: date("2100-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-04-05",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail-open.mp3",
      name: "Abierta",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 15,
    });

    const detail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(detail.dancerEditingEligibility).toEqual({
      canEdit: true,
      reasonCode: null,
      reasonText: null,
    });
  });

  test("updates linked Profesores for active Evento detail, keeps archived linked rows visible, and blocks re-adding archived removals", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.edit.owner@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-04-05",
    });
    const activeProfessor = await createProfessor(owner.academyId, {
      firstName: "Luz",
      lastName: "Activa",
    });
    const archivedLinkedProfessor = await createProfessor(owner.academyId, {
      active: false,
      firstName: "Mora",
      lastName: "Archivada",
    });
    const archivedUnlinkedProfessor = await createProfessor(owner.academyId, {
      active: false,
      firstName: "Nora",
      lastName: "Oculta",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail-update.mp3",
      name: "Editable",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 15,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: archivedLinkedProfessor.id,
    });

    const initialDetail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(initialDetail.eventContext.isReadOnly).toBe(false);
    expect(initialDetail.eventContext.isRegistrationOpen).toBe(false);
    expect(initialDetail.availableProfessors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: archivedLinkedProfessor.id,
          active: false,
        }),
        expect.objectContaining({
          id: activeProfessor.id,
          active: true,
        }),
      ]),
    );
    expect(
      initialDetail.availableProfessors.map((professor) => professor.id),
    ).not.toContain(archivedUnlinkedProfessor.id);

    const updateResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        professorLinkFormData([activeProfessor.id]),
      ),
    });

    expect(updateResponse).toBeInstanceOf(Response);
    if (!(updateResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(updateResponse.status).toBe(302);
    expect(updateResponse.headers.get("location")).toBe(
      `/portal/coreografias/${choreography.id}?actualizado=1`,
    );

    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toMatchObject([{ professorId: activeProfessor.id }]);

    const updatedDetail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(updatedDetail.choreography.professors).toMatchObject([
      {
        id: activeProfessor.id,
        active: true,
      },
    ]);
    expect(
      updatedDetail.availableProfessors.map((professor) => professor.id),
    ).toEqual([activeProfessor.id]);

    const rejectedResult = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        professorLinkFormData([archivedLinkedProfessor.id]),
      ),
    });

    expect(rejectedResult).toMatchObject({
      status: "error",
      message:
        "Seleccioná solo Profesores activos o ya vinculados a esta Coreografía.",
    });

    const afterRejectedAttempt = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(afterRejectedAttempt.choreography.operationalStatus).toEqual({
      code: "complete",
      pendingItems: [],
    });

    await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        professorLinkFormData([]),
      ),
    });

    const withoutProfessors = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(withoutProfessors.choreography.operationalStatus).toEqual({
      code: "incomplete",
      pendingItems: ["professors"],
    });
  });

  test("does not load historical Evento detail in V1 active-event context", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Histórica",
      email: "coreografias.detail.readonly.owner@example.com",
    });
    const historicalEvent = await createEventRecord({
      active: false,
      name: "Regional 2025",
    });
    const activeEvent = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const historicalCatalog = await createEventCatalog(historicalEvent.id);
    await createEventCatalog(activeEvent.id);
    const dancer = await createDancer(owner.academyId);
    const professor = await createProfessor(owner.academyId);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: historicalCatalog.categoryWithLevel.id,
      eventId: historicalEvent.id,
      experienceLevelId: historicalCatalog.level.id,
      modalityId: historicalCatalog.modality.id,
      musicStorageKey: "music/readonly.mp3",
      name: "Histórica",
      scheduleEntryId: historicalCatalog.scheduleEntry.id,
      submodalityId: historicalCatalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 14,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    await expect(
      choreographyDetailLoader({
        params: { choreographyId: choreography.id },
        request: new Request(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${historicalEvent.id}`,
          {
            headers: { cookie: owner.cookie },
          },
        ),
      }),
    ).rejects.toMatchObject({
      status: 404,
    });

    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toMatchObject([{ professorId: professor.id }]);
  });

  test("deletes an eligible Coreografía from detail, cascades bridge rows, and redirects back to the list even when registration is closed", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Elegible",
      email: "coreografias.detail.delete.owner@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationEndsAt: date("2000-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-04-05",
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
      musicStorageKey: null,
      name: "A Eliminar",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 15,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const deleteResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        deleteChoreographyFormData(choreography.id),
      ),
    });

    expect(deleteResponse).toBeInstanceOf(Response);
    if (!(deleteResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(deleteResponse.status).toBe(302);
    expect(deleteResponse.headers.get("location")).toBe(
      "/portal/coreografias?eliminada=1",
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

  test("rejects deleting a Coreografía ajena from the detail action", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.delete.other-owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena",
      email: "coreografias.detail.delete.other@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: other.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Ajena",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });

    await expect(
      choreographyDetailAction({
        params: { choreographyId: choreography.id },
        request: createPortalPostRequest(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
          owner.cookie,
          deleteChoreographyFormData(choreography.id),
        ),
      }),
    ).rejects.toMatchObject({
      status: 404,
    });

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeDefined();
  });

  test("keeps history-protecting foreign keys restrictive and cascades bridge rows only when the choreography is deleted", async () => {
    const academy = await createAcademyRecord({
      academyName: "Academia",
      email: "coreografias.schema@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(academy.id, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
    });
    const professor = await createProfessor(academy.id, {
      firstName: "Luz",
      lastName: "Paz",
    });
    const choreography = await createChoreographyRecord({
      academyId: academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/schema.mp3",
      name: "Protegida",
      scheduleEntryId: catalog.scheduleEntry.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    await expect(
      db.delete(dancers).where(eq(dancers.id, dancer.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(professors).where(eq(professors.id, professor.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(categories)
        .where(eq(categories.id, catalog.categoryWithLevel.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(experienceLevels)
        .where(eq(experienceLevels.id, catalog.level.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(scheduleEntries)
        .where(eq(scheduleEntries.id, catalog.scheduleEntry.id)),
    ).rejects.toThrow();

    await db
      .delete(choreographies)
      .where(eq(choreographies.id, choreography.id));

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
});

async function createAcademySession({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: academyName,
      contactName: "Contacto",
      phone: "11 1234-5678",
    })
    .returning();

  return {
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createAcademyRecord({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const [record] = await db
    .insert(user)
    .values({
      email,
      name: email,
      emailVerified: true,
      role: "academy",
    })
    .returning();

  const [academy] = await db
    .insert(academies)
    .values({
      userId: record.id,
      name: academyName,
      contactName: "Contacto",
      phone: "11 1234-5678",
    })
    .returning();

  return academy;
}

async function createEventRecord(
  overrides: Partial<typeof events.$inferInsert> = {},
) {
  const [event] = await db
    .insert(events)
    .values({
      name: "Evento",
      active: false,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 30,
      registrationStartsAt: date("2026-03-01T12:00:00Z"),
      registrationEndsAt: date("2026-04-30T12:00:00Z"),
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
      ...overrides,
    })
    .returning();

  return event;
}

async function createEventCatalog(eventId: string) {
  const [modality] = await db
    .insert(modalities)
    .values({
      eventId,
      name: `Jazz ${eventId}`,
    })
    .returning();
  const [submodality] = await db
    .insert(submodalities)
    .values({
      eventId,
      modalityId: modality.id,
      name: `Lyrical ${eventId}`,
    })
    .returning();
  const [level] = await db
    .insert(experienceLevels)
    .values({
      eventId,
      name: `Inicial ${eventId}`,
    })
    .returning();
  const [categoryWithLevel] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevelKey: level.id,
    })
    .returning();
  const [categoryWithoutLevel] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Adultos ${eventId}`,
      minAge: 18,
      maxAge: 99,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevelKey: "",
    })
    .returning();
  await db.insert(categoryExperienceLevels).values({
    categoryId: categoryWithLevel.id,
    experienceLevelId: level.id,
  });
  const [scheduleBlock] = await db
    .insert(scheduleBlocks)
    .values({
      eventId,
      name: `Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleBlockModalities).values({
    scheduleBlockId: scheduleBlock.id,
    modalityId: modality.id,
  });
  const [scheduleEntry] = await db
    .insert(scheduleEntries)
    .values({
      scheduleBlockId: scheduleBlock.id,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      capacity: 5,
    })
    .returning();

  return {
    categoryWithLevel,
    categoryWithoutLevel,
    level,
    modality,
    scheduleBlock,
    scheduleEntry,
    submodality,
  };
}

async function createDancer(
  academyId: string,
  overrides: Partial<typeof dancers.$inferInsert> = {},
) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
      active: true,
      ...overrides,
    })
    .returning();

  return dancer;
}

async function createProfessor(
  academyId: string,
  overrides: Partial<typeof professors.$inferInsert> = {},
) {
  const [professor] = await db
    .insert(professors)
    .values({
      academyId,
      firstName: "Luz",
      lastName: "Suárez",
      active: true,
      ...overrides,
    })
    .returning();

  return professor;
}

async function createChoreographyRecord(
  overrides: Partial<typeof choreographies.$inferInsert> & {
    academyId: string;
    eventId: string;
    modalityId: string;
    scheduleEntryId: string;
    name: string;
  },
) {
  const [choreography] = await db
    .insert(choreographies)
    .values({
      academyId: overrides.academyId,
      eventId: overrides.eventId,
      name: overrides.name,
      modalityId: overrides.modalityId,
      submodalityId: overrides.submodalityId ?? null,
      groupType: overrides.groupType ?? "solo",
      categoryId: overrides.categoryId ?? null,
      categoryAgeBasis: overrides.categoryAgeBasis ?? 13,
      categoryCalculationMode: overrides.categoryCalculationMode ?? "oldest",
      experienceLevelId: overrides.experienceLevelId ?? null,
      scheduleEntryId: overrides.scheduleEntryId,
      musicStorageKey: overrides.musicStorageKey ?? null,
      hasPresentation: overrides.hasPresentation ?? false,
      hasActiveFinancialLink: overrides.hasActiveFinancialLink ?? false,
      createdAt: overrides.createdAt,
      updatedAt: overrides.updatedAt,
    })
    .returning();

  return choreography;
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
}

function createPortalPostRequest(
  requestUrl: string,
  cookie: string,
  body: FormData,
) {
  return new Request(requestUrl, {
    method: "POST",
    headers: { cookie },
    body,
  });
}

function professorLinkFormData(professorIds: string[]) {
  const formData = new FormData();
  formData.set("intent", "update-choreography-professors");

  for (const professorId of professorIds) {
    formData.append("professorIds", professorId);
  }

  return formData;
}

function deleteChoreographyFormData(choreographyId: string) {
  const formData = new FormData();
  formData.set("intent", "delete-choreography");
  formData.set("confirmDeletion", choreographyId);

  return formData;
}

function date(value: string) {
  return new Date(value);
}
