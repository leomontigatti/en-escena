import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographyDancers,
  choreographyProfessors,
  modalities,
  paymentAllocations,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
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

  /** A seminar inscription of the dancer, in a seminar of the event. */
  const addSeminarInscription = async (input: {
    dancerId: string;
    registeredAt: string;
  }) => {
    const [seminar] = await db
      .insert(seminars)
      .values({
        eventId: event.id,
        instructorName: `Instructor ${crypto.randomUUID()}`,
        quota: 20,
        scheduledDate: "2026-05-02",
        startTime: "10:00",
      })
      .returning();
    const [inscription] = await db
      .insert(seminarInscriptions)
      .values({
        createdAt: new Date(input.registeredAt),
        dancerId: input.dancerId,
        seminarId: seminar.id,
      })
      .returning();

    return inscription;
  };

  /**
   * A payment of the academy, with money allocated to the inscriptions named;
   * whatever is not allocated stays free on the payment.
   */
  const addPayment = async (input: {
    academyId: string;
    allocations?: (
      | { amount: number; choreographyInscriptionId: string }
      | { amount: number; seminarInscriptionId: string }
    )[];
    amount: number;
    paymentDate: string;
  }) => {
    const { paymentId } = await registerAcademyEventPayment({
      academyId: input.academyId,
      amount: input.amount,
      eventId: event.id,
      internalNote: null,
      paymentDate: input.paymentDate,
      paymentMethod: "transferencia",
      reference: null,
    });

    if (input.allocations?.length) {
      await db.insert(paymentAllocations).values(
        input.allocations.map((allocation) => ({
          ...allocation,
          academyId: input.academyId,
          eventId: event.id,
          paymentId,
        })),
      );
    }

    return paymentId;
  };

  return {
    addAcademy,
    addChoreography,
    addDancer: createDancer,
    addModality,
    addPayment,
    addProfessor: createProfessor,
    addSeminarInscription,
    catalog,
    event,
    inscribe,
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
