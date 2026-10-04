import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  modalities,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import {
  createAcademyUser,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import type { Province } from "@/lib/academies/provinces";

import { buildPeriodExportHref, type ExportPeriod } from "./shared";

/**
 * The seed the auditor export tests start from: the event selected in the
 * shell, with its catalog, and the few verbs a test needs to put academies,
 * people and inscriptions registered on a given moment into it.
 */
export async function seedPeriodExportFixture() {
  const event = await createSavedEvent({ name: "En Escena 2026" });
  const catalog = await createEventCatalog(event.id);

  const addAcademy = async (input: {
    contactName?: string;
    name: string;
    phone?: string;
    province?: Province | null;
  }) => {
    const { academy } = await createAcademyUser({
      academyName: input.name,
      email: `${crypto.randomUUID()}@example.com`,
    });
    const [updated] = await db
      .update(academies)
      .set({
        contactName: input.contactName ?? academy.contactName,
        phone: input.phone ?? academy.phone,
        province: input.province ?? null,
      })
      .where(eq(academies.id, academy.id))
      .returning();

    return updated;
  };

  const addModality = async (name: string) => {
    const [modality] = await db
      .insert(modalities)
      .values({ eventId: event.id, name })
      .returning();

    return modality;
  };

  const addChoreography = async (input: {
    academyId: string;
    modalityId?: string;
    name?: string;
    professorIds?: string[];
  }) => {
    const choreography = await createChoreographyRecord({
      academyId: input.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      modalityId: input.modalityId ?? catalog.modality.id,
      name: input.name ?? "Coreografía",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    if (input.professorIds?.length) {
      await db.insert(choreographyProfessors).values(
        input.professorIds.map((professorId) => ({
          choreographyId: choreography.id,
          professorId,
        })),
      );
    }

    return choreography;
  };

  /** An inscription registered at `registeredAt`, an ISO moment. */
  const inscribe = async (input: {
    choreographyId: string;
    dancerId: string;
    registeredAt: string;
    withdrawn?: boolean;
  }) => {
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId: input.choreographyId,
        createdAt: new Date(input.registeredAt),
        dancerId: input.dancerId,
        withdrawnAt: input.withdrawn ? new Date(input.registeredAt) : null,
      })
      .returning();

    return inscription;
  };

  const withdrawChoreography = async (choreographyId: string) => {
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, choreographyId));
  };

  return {
    addAcademy,
    addChoreography,
    addDancer: createDancer,
    addModality,
    addProfessor: createProfessor,
    catalog,
    event,
    inscribe,
    withdrawChoreography,
  };
}

/** A download of `path` for the period, by a user of `role`. */
export async function periodExportRequest(
  path: string,
  period: ExportPeriod,
  role: "academy" | "admin" | "auditor" | "judge" = "auditor",
) {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${buildPeriodExportHref(path, period)}`,
    role,
  });

  return request;
}
