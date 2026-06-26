import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  scheduleModalities,
  schedules,
  scheduleCapacities,
} from "@/db/schema";
import {
  handlePortalChoreographyDetailRouteAction as choreographyDetailAction,
  loadPortalChoreographyDetail as choreographyDetailLoader,
} from "@/features/portal/choreographies/detail/server";
import { createPortalPostRequest } from "@/features/portal/test-support/db";
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
  choreographyUpdateFormData,
  dancerLinkFormData,
  resolveDancerLinkFormData,
} from "@/features/portal/choreographies/test-support/forms";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreographies reads", () => {
  test("shows detail only for the authenticated Academia inside the selected Evento and includes archived linked roster", async () => {
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
      scheduleCapacityId: catalog.scheduleCapacity.id,
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
      scheduleCapacityId: catalog.scheduleCapacity.id,
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
      scheduleCapacityId: catalog.scheduleCapacity.id,
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
      scheduleCapacityId: catalog.scheduleCapacity.id,
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
      scheduleCapacityId: catalog.scheduleCapacity.id,
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
      scheduleCapacityId: catalog.scheduleCapacity.id,
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
        choreographyUpdateFormData({
          dancerIds: [dancer.id],
          professorIds: [activeProfessor.id],
        }),
      ),
    });

    expect(updateResponse).toBeInstanceOf(Response);
    if (!(updateResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(updateResponse.status).toBe(302);
    expect(updateResponse.headers.get("location")).toBe(
      `/portal/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
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
        choreographyUpdateFormData({
          dancerIds: [dancer.id],
          professorIds: [archivedLinkedProfessor.id],
        }),
      ),
    });

    expect(rejectedResult).toMatchObject({
      status: "update-error",
      section: "professors",
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
        choreographyUpdateFormData({
          dancerIds: [dancer.id],
          professorIds: [],
        }),
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

  test("updates linked bailarines for eligible compatible roster changes, preserves profesores, and rejects later ineligible saves", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster",
      email: "coreografias.detail.dancers.owner@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const archivedLinkedDancer = await createDancer(owner.academyId, {
      active: false,
      firstName: "Mora",
      lastName: "Archivada",
      birthDate: "2011-04-05",
    });
    const activeReplacementDancer = await createDancer(owner.academyId, {
      firstName: "Luz",
      lastName: "Activa",
      birthDate: "2011-05-05",
    });
    const archivedUnlinkedDancer = await createDancer(owner.academyId, {
      active: false,
      firstName: "Nora",
      lastName: "Oculta",
      birthDate: "2011-06-05",
    });
    const professor = await createProfessor(owner.academyId, {
      firstName: "Profe",
      lastName: "Quieta",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/dancers-update.mp3",
      name: "Editable",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: archivedLinkedDancer.id,
      ageAtEventStart: 15,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
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

    expect(initialDetail.dancerEditingEligibility).toEqual({
      canEdit: true,
      reasonCode: null,
      reasonText: null,
    });
    expect(initialDetail.availableDancers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: archivedLinkedDancer.id,
          active: false,
        }),
        expect.objectContaining({
          id: activeReplacementDancer.id,
          active: true,
        }),
      ]),
    );
    expect(
      initialDetail.availableDancers.map((dancer) => dancer.id),
    ).not.toContain(archivedUnlinkedDancer.id);

    const resolutionResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        resolveDancerLinkFormData([activeReplacementDancer.id]),
      ),
    });

    expect(resolutionResponse).toMatchObject({
      intent: "resolve-choreography-dancers",
      result: {
        ok: true,
        resolution: {
          schedule: {
            status: "keep-current",
            selectedScheduleCapacityId: catalog.scheduleCapacity.id,
          },
        },
      },
    });

    const updateResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([activeReplacementDancer.id], {
          professorIds: [professor.id],
        }),
      ),
    });

    expect(updateResponse).toBeInstanceOf(Response);
    if (!(updateResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(updateResponse.status).toBe(302);
    expect(updateResponse.headers.get("location")).toBe(
      `/portal/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
    );

    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toMatchObject([{ dancerId: activeReplacementDancer.id }]);
    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toMatchObject([{ professorId: professor.id }]);

    const updatedDetail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(updatedDetail.choreography.dancers).toMatchObject([
      {
        id: activeReplacementDancer.id,
        active: true,
      },
    ]);
    expect(updatedDetail.availableDancers.map((dancer) => dancer.id)).toEqual([
      activeReplacementDancer.id,
    ]);

    const rejectedArchivedReuse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([archivedLinkedDancer.id], {
          professorIds: [professor.id],
        }),
      ),
    });

    expect(rejectedArchivedReuse).toMatchObject({
      status: "update-error",
      section: "dancers",
      message:
        "Seleccioná solo bailarines activos o ya vinculados a esta coreografía.",
    });

    await db
      .update(choreographies)
      .set({ hasPresentation: true })
      .where(eq(choreographies.id, choreography.id));

    const rejectedIneligibleSave = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([archivedLinkedDancer.id], {
          professorIds: [professor.id],
        }),
      ),
    });

    expect(rejectedIneligibleSave).toMatchObject({
      status: "update-error",
      section: "dancers",
      message:
        "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    });

    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toMatchObject([{ dancerId: activeReplacementDancer.id }]);
  });

  test("autoassigns the only compatible cupo de cronograma when a roster edit changes the tipo de grupo", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cupo de cronograma",
      email: "coreografias.detail.dancers.schedule-auto@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const [duoScheduleCapacity, trioScheduleCapacity] = await db
      .insert(scheduleCapacities)
      .values([
        {
          scheduleId: catalog.schedule.id,
          groupType: "duo",
          capacity: 5,
        },
        {
          scheduleId: catalog.schedule.id,
          groupType: "trio",
          capacity: 5,
        },
      ])
      .returning();
    const [linkedDancer, secondLinkedDancer, addedDancer] = await Promise.all([
      createDancer(owner.academyId, {
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2012-04-05",
      }),
      createDancer(owner.academyId, {
        firstName: "Luz",
        lastName: "Roa",
        birthDate: "2012-05-05",
      }),
      createDancer(owner.academyId, {
        firstName: "Mora",
        lastName: "Díaz",
        birthDate: "2012-06-05",
      }),
    ]);

    await db
      .update(categories)
      .set({
        groupTypes: ["solo", "duo", "trio"],
        groupTypeKey: "duo|solo|trio",
      })
      .where(eq(categories.id, catalog.categoryWithLevel.id));

    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      groupType: "duo",
      modalityId: catalog.modality.id,
      name: "Editable con cupo de cronograma",
      scheduleCapacityId: duoScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values([
      {
        choreographyId: choreography.id,
        dancerId: linkedDancer.id,
        ageAtEventStart: 14,
      },
      {
        choreographyId: choreography.id,
        dancerId: secondLinkedDancer.id,
        ageAtEventStart: 14,
      },
    ]);

    const updateResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([
          linkedDancer.id,
          secondLinkedDancer.id,
          addedDancer.id,
        ]),
      ),
    });

    expect(updateResponse).toBeInstanceOf(Response);
    if (!(updateResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(updateResponse.status).toBe(302);
    expect(updateResponse.headers.get("location")).toBe(
      `/portal/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
    );

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      groupType: "trio",
      categoryId: catalog.categoryWithLevel.id,
      experienceLevelId: catalog.level.id,
      scheduleCapacityId: trioScheduleCapacity.id,
    });
    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toHaveLength(3);
  });

  test("requires academy selection when multiple compatible cupos de cronograma exist for the edited roster", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cupo de cronograma Múltiple",
      email: "coreografias.detail.dancers.schedule-multiple@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const [alternateSchedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Bloque alternativo ${event.id}`,
        scheduledDate: "2026-05-02",
        startTime: "14:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: alternateSchedule.id,
      modalityId: catalog.modality.id,
    });
    const [
      duoScheduleCapacity,
      firstTrioScheduleCapacity,
      secondTrioScheduleCapacity,
    ] = await db
      .insert(scheduleCapacities)
      .values([
        {
          scheduleId: catalog.schedule.id,
          groupType: "duo",
          capacity: 5,
        },
        {
          scheduleId: catalog.schedule.id,
          groupType: "trio",
          capacity: 5,
        },
        {
          scheduleId: alternateSchedule.id,
          groupType: "trio",
          capacity: 3,
        },
      ])
      .returning();
    const dancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2012-04-05" }),
      createDancer(owner.academyId, { birthDate: "2012-05-05" }),
      createDancer(owner.academyId, { birthDate: "2012-06-05" }),
    ]);

    await db
      .update(categories)
      .set({
        groupTypes: ["solo", "duo", "trio"],
        groupTypeKey: "duo|solo|trio",
      })
      .where(eq(categories.id, catalog.categoryWithLevel.id));

    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      groupType: "duo",
      modalityId: catalog.modality.id,
      name: "Editable con selección",
      scheduleCapacityId: duoScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values([
      {
        choreographyId: choreography.id,
        dancerId: dancers[0].id,
        ageAtEventStart: 14,
      },
      {
        choreographyId: choreography.id,
        dancerId: dancers[1].id,
        ageAtEventStart: 14,
      },
    ]);

    const resolutionResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        resolveDancerLinkFormData(dancers.map((dancer) => dancer.id)),
      ),
    });

    expect(resolutionResponse).toMatchObject({
      intent: "resolve-choreography-dancers",
      result: {
        ok: true,
        resolution: {
          schedule: {
            status: "multiple",
            options: [
              { id: firstTrioScheduleCapacity.id },
              { id: secondTrioScheduleCapacity.id },
            ],
          },
        },
      },
    });

    const blockedResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData(dancers.map((dancer) => dancer.id)),
      ),
    });

    expect(blockedResponse).toMatchObject({
      status: "update-error",
      section: "dancers",
      fieldErrors: {
        scheduleCapacityId:
          "Elegí un Cupo de cronograma compatible para guardar los bailarines.",
      },
    });

    const saveResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData(
          dancers.map((dancer) => dancer.id),
          {
            scheduleCapacityId: firstTrioScheduleCapacity.id,
          },
        ),
      ),
    });

    expect(saveResponse).toBeInstanceOf(Response);
    if (!(saveResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(saveResponse.headers.get("location")).toBe(
      `/portal/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
    );
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      groupType: "trio",
      scheduleCapacityId: firstTrioScheduleCapacity.id,
    });
  });

  test("saves roster changes against cronograma global capacity when no specific cupo de cronograma exists", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Sin Cupo de cronograma",
      email: "coreografias.detail.dancers.schedule-none@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const [duoScheduleCapacity] = await db
      .insert(scheduleCapacities)
      .values({
        scheduleId: catalog.schedule.id,
        groupType: "duo",
        capacity: 5,
      })
      .returning();
    const dancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2012-04-05" }),
      createDancer(owner.academyId, { birthDate: "2012-05-05" }),
      createDancer(owner.academyId, { birthDate: "2012-06-05" }),
    ]);

    await db
      .update(categories)
      .set({
        groupTypes: ["solo", "duo", "trio"],
        groupTypeKey: "duo|solo|trio",
      })
      .where(eq(categories.id, catalog.categoryWithLevel.id));

    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      groupType: "duo",
      modalityId: catalog.modality.id,
      name: "Editable sin cupo de cronograma",
      scheduleCapacityId: duoScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values([
      {
        choreographyId: choreography.id,
        dancerId: dancers[0].id,
        ageAtEventStart: 14,
      },
      {
        choreographyId: choreography.id,
        dancerId: dancers[1].id,
        ageAtEventStart: 14,
      },
    ]);

    const response = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData(dancers.map((dancer) => dancer.id)),
      ),
    });

    expect(response).toBeInstanceOf(Response);

    if (!(response instanceof Response)) {
      throw new Error("Expected successful choreography update redirect.");
    }

    expect(response.headers.get("location")).toBe(
      `/portal/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
    );
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      groupType: "trio",
      scheduleId: catalog.schedule.id,
      scheduleCapacityId: null,
    });
    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toHaveLength(3);
  });

  test("revalidates cupo de cronograma cupo on confirmation and keeps the original roster when capacity is lost concurrently", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cupo Concurrente",
      email: "coreografias.detail.dancers.schedule-cupo@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Cupo Competidora",
      email: "coreografias.detail.dancers.schedule-cupo-other@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const [duoScheduleCapacity, trioScheduleCapacity] = await db
      .insert(scheduleCapacities)
      .values([
        {
          scheduleId: catalog.schedule.id,
          groupType: "duo",
          capacity: 5,
        },
        {
          scheduleId: catalog.schedule.id,
          groupType: "trio",
          capacity: 1,
        },
      ])
      .returning();
    const dancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2012-04-05" }),
      createDancer(owner.academyId, { birthDate: "2012-05-05" }),
      createDancer(owner.academyId, { birthDate: "2012-06-05" }),
    ]);
    const otherDancers = await Promise.all([
      createDancer(other.academyId, { birthDate: "2012-04-05" }),
      createDancer(other.academyId, { birthDate: "2012-05-05" }),
      createDancer(other.academyId, { birthDate: "2012-06-05" }),
    ]);

    await db
      .update(categories)
      .set({
        groupTypes: ["solo", "duo", "trio"],
        groupTypeKey: "duo|solo|trio",
      })
      .where(eq(categories.id, catalog.categoryWithLevel.id));

    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      groupType: "duo",
      modalityId: catalog.modality.id,
      name: "Editable con cupo concurrente",
      scheduleCapacityId: duoScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values([
      {
        choreographyId: choreography.id,
        dancerId: dancers[0].id,
        ageAtEventStart: 14,
      },
      {
        choreographyId: choreography.id,
        dancerId: dancers[1].id,
        ageAtEventStart: 14,
      },
    ]);

    const resolutionResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        resolveDancerLinkFormData(dancers.map((dancer) => dancer.id)),
      ),
    });

    expect(resolutionResponse).toMatchObject({
      intent: "resolve-choreography-dancers",
      result: {
        ok: true,
        resolution: {
          schedule: {
            status: "auto",
            selectedScheduleCapacityId: trioScheduleCapacity.id,
          },
        },
      },
    });

    const occupiedChoreography = await createChoreographyRecord({
      academyId: other.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      groupType: "trio",
      modalityId: catalog.modality.id,
      name: "Ocupa el cupo",
      scheduleCapacityId: trioScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values([
      {
        choreographyId: occupiedChoreography.id,
        dancerId: otherDancers[0].id,
        ageAtEventStart: 14,
      },
      {
        choreographyId: occupiedChoreography.id,
        dancerId: otherDancers[1].id,
        ageAtEventStart: 14,
      },
      {
        choreographyId: occupiedChoreography.id,
        dancerId: otherDancers[2].id,
        ageAtEventStart: 14,
      },
    ]);

    const response = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData(dancers.map((dancer) => dancer.id)),
      ),
    });

    expect(response).toMatchObject({
      status: "update-error",
      section: "dancers",
      message:
        "El Cupo de cronograma seleccionado ya no tiene cupo disponible.",
    });
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      groupType: "duo",
      scheduleCapacityId: duoScheduleCapacity.id,
    });
    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toHaveLength(2);
  });

  test("recalculates category data while editing bailarines, requires nivel when needed, clears stale level, and allows no-category saves", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Categorías",
      email: "coreografias.detail.categories.owner@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const adultDancer = await createDancer(owner.academyId, {
      firstName: "Ada",
      lastName: "Mayor",
      birthDate: "2000-04-05",
    });
    const teenDancer = await createDancer(owner.academyId, {
      firstName: "Luz",
      lastName: "Joven",
      birthDate: "2011-04-05",
    });
    const uncategorizedDancer = await createDancer(owner.academyId, {
      firstName: "Nora",
      lastName: "SinCategoría",
      birthDate: "1900-04-05",
    });
    const professor = await createProfessor(owner.academyId, {
      firstName: "Pía",
      lastName: "Guía",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithoutLevel.id,
      eventId: event.id,
      experienceLevelId: null,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/category-edit.mp3",
      name: "Editable",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: adultDancer.id,
      ageAtEventStart: 26,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const missingLevelResult = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([teenDancer.id], {
          professorIds: [professor.id],
        }),
      ),
    });

    expect(missingLevelResult).toMatchObject({
      status: "update-error",
      section: "dancers",
      fieldErrors: {
        experienceLevelId: "Este campo es obligatorio.",
      },
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: {
          categoryId: true,
          experienceLevelId: true,
        },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: catalog.categoryWithoutLevel.id,
      experienceLevelId: null,
    });

    const updateWithLevelResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([teenDancer.id], {
          experienceLevelId: catalog.level.id,
          professorIds: [professor.id],
        }),
      ),
    });

    expect(updateWithLevelResponse).toBeInstanceOf(Response);
    if (!(updateWithLevelResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(updateWithLevelResponse.status).toBe(302);

    const afterRequiredLevelSave = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(afterRequiredLevelSave.choreography).toMatchObject({
      categoryName: catalog.categoryWithLevel.name,
      experienceLevelName: catalog.level.name,
      groupType: "solo",
      operationalStatus: {
        code: "complete",
        pendingItems: [],
      },
    });

    const clearsLevelResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([adultDancer.id], {
          experienceLevelId: catalog.level.id,
          professorIds: [professor.id],
        }),
      ),
    });

    expect(clearsLevelResponse).toBeInstanceOf(Response);

    await expect(
      db.query.choreographies.findFirst({
        columns: {
          categoryId: true,
          experienceLevelId: true,
        },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: catalog.categoryWithoutLevel.id,
      experienceLevelId: null,
    });

    const noCategoryResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        dancerLinkFormData([uncategorizedDancer.id], {
          experienceLevelId: catalog.level.id,
          professorIds: [professor.id],
        }),
      ),
    });

    expect(noCategoryResponse).toBeInstanceOf(Response);

    const noCategoryDetail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(noCategoryDetail.choreography).toMatchObject({
      categoryName: null,
      experienceLevelName: null,
      operationalStatus: {
        code: "incomplete",
        pendingItems: ["category"],
      },
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
      scheduleCapacityId: historicalCatalog.scheduleCapacity.id,
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
});
