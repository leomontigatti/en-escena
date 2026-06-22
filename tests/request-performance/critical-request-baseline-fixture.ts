import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  categoryModalities,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  experienceLevels,
  modalities,
  prices,
  professors,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { createEvent, activateEvent } from "@/lib/events/management.server";

let nextIdentity = 0;

export async function seedBaselineFixture() {
  const admin = await createInternalSession("admin");
  const academy = await createAcademySession();

  const activeEvent = await createSavedEvent({
    name: "Evento Activo",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
  });
  const futureEvent = await createSavedEvent({
    name: "Evento Futuro",
    registrationStartsAt: date("2027-03-01T12:00:00Z"),
    registrationEndsAt: date("2027-04-30T12:00:00Z"),
    startsAt: date("2027-05-01T12:00:00Z"),
    endsAt: date("2027-05-03T12:00:00Z"),
  });
  await createSavedEvent({
    name: "Evento Finalizado",
    registrationStartsAt: date("2024-03-01T12:00:00Z"),
    registrationEndsAt: date("2024-04-30T12:00:00Z"),
    startsAt: date("2024-05-01T12:00:00Z"),
    endsAt: date("2024-05-03T12:00:00Z"),
  });
  await activateEvent(activeEvent.id);

  const catalog = await createEventCatalog(activeEvent.id);
  await db
    .update(events)
    .set({ registrationReadinessDirty: false })
    .where(eq(events.id, activeEvent.id));
  await db
    .update(events)
    .set({ registrationReadinessDirty: true })
    .where(eq(events.id, futureEvent.id));

  const dancer = await createDancer(academy.academyId, {
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2012-01-10",
  });
  const secondaryDancer = await createDancer(academy.academyId, {
    firstName: "Bea",
    lastName: "Lagos",
    birthDate: "2011-02-11",
  });
  const professor = await createProfessor(academy.academyId, {
    firstName: "Luz",
    lastName: "Suarez",
  });
  const secondaryProfessor = await createProfessor(academy.academyId, {
    firstName: "Nora",
    lastName: "Diaz",
  });
  const choreography = await createChoreographyRecord({
    academyId: academy.academyId,
    eventId: activeEvent.id,
    name: "Coreografía Base",
    modalityId: catalog.modality.id,
    submodalityId: catalog.submodality.id,
    categoryId: catalog.categoryWithLevel.id,
    experienceLevelId: catalog.level.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
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

  return {
    activeEvent,
    academy,
    admin,
    catalog,
    choreography,
    dancer,
    professor,
    secondaryDancer,
    secondaryProfessor,
    adminRequest(path: string, body?: FormData) {
      return new Request(toUrl(path), {
        method: body ? "POST" : "GET",
        body,
        headers: { cookie: admin.cookie },
      });
    },
    portalRequest(path: string) {
      return new Request(toUrl(path), {
        headers: { cookie: academy.cookie },
      });
    },
    portalPostRequest(path: string, body: FormData) {
      return new Request(toUrl(path), {
        method: "POST",
        body,
        headers: { cookie: academy.cookie },
      });
    },
  };
}

export function adminLoaderArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: new URL(request.url).pathname,
  };
}

export function portalLayoutArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/portal",
  };
}

export function adminDetailArgs(request: Request, eventId: string) {
  return {
    request,
    params: { eventId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos/:eventId",
  };
}

export function adminEventFormData(values: Record<string, string>) {
  return stringFormData({
    intent: "update",
    ...values,
  });
}

export function stringFormData(values: Record<string, string | string[]>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, item);
      }
      continue;
    }

    formData.set(key, value);
  }

  return formData;
}

export function choreographyCreateFormData(input: {
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleCapacityId: string;
}) {
  return stringFormData({
    intent: "create-choreography",
    eventId: input.eventId,
    name: input.name,
    modalityId: input.modalityId,
    submodalityId: input.submodalityId,
    dancerIds: input.dancerIds,
    professorIds: input.professorIds,
    experienceLevelId: input.experienceLevelId,
    scheduleCapacityId: input.scheduleCapacityId,
  });
}

export function choreographyUpdateFormData(input: {
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleCapacityId: string;
}) {
  return stringFormData({
    intent: "update-choreography",
    dancerIds: input.dancerIds,
    professorIds: input.professorIds,
    experienceLevelId: input.experienceLevelId,
    scheduleCapacityId: input.scheduleCapacityId,
  });
}

async function createInternalSession(role: "admin" | "auditor") {
  const identity = nextEmailSlug();
  const signUpResult = await createLocalAccessUser({
    email: `${identity}@example.com`,
    name: `${identity}@example.com`,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createAcademySession() {
  const identity = nextEmailSlug();
  const signUpResult = await createLocalAccessUser({
    email: `${identity}@example.com`,
    name: `${identity}@example.com`,
    password: "password-segura",
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
      name: "Academia Medición",
      contactName: "Contacto",
      phone: "1112345678",
    })
    .returning();

  return {
    academy,
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "Evento",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

async function createEventCatalog(eventId: string) {
  const [modality] = await db
    .insert(modalities)
    .values({ eventId, name: `Jazz ${eventId}` })
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
    .values({ eventId, name: `Inicial ${eventId}` })
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
  await db.insert(categoryModalities).values({
    categoryId: categoryWithLevel.id,
    modalityId: modality.id,
  });
  await db.insert(categoryExperienceLevels).values({
    categoryId: categoryWithLevel.id,
    experienceLevelId: level.id,
  });
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId,
      name: `Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleModalities).values({
    scheduleId: schedule.id,
    modalityId: modality.id,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
      capacity: 5,
    })
    .returning();
  await db.insert(prices).values({
    eventId,
    name: `Precio ${eventId}`,
    groupType: "solo",
    amount: 10000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
  });

  return {
    categoryWithLevel,
    level,
    modality,
    scheduleCapacity,
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
      lastName: "Suarez",
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
    name: string;
    modalityId: string;
    scheduleCapacityId: string;
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
      scheduleCapacityId: overrides.scheduleCapacityId,
      musicStorageKey: overrides.musicStorageKey ?? "music/base.mp3",
      hasPresentation: overrides.hasPresentation ?? false,
      hasActiveFinancialLink: overrides.hasActiveFinancialLink ?? false,
    })
    .returning();

  return choreography;
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return `sb-access-token=${sessionCookie[1]}`;
}

function toUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `http://localhost${path}`;
}

function nextEmailSlug() {
  nextIdentity += 1;
  return `baseline-${nextIdentity}`;
}

function date(value: string) {
  return new Date(value);
}
