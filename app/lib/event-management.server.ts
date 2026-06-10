import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

const ACTIVE_EVENT_EXISTS_ERROR =
  "Hay otro Evento activo. Desactivá el Evento activo antes de activar este.";
const INVALID_EVENT_ERROR = "Revisá los datos del Evento.";
const ACTIVE_EVENT_DELETION_ERROR =
  "No se puede borrar un Evento activo. Desactivalo primero.";
const DEPENDENT_EVENT_DELETION_ERROR =
  "No se puede borrar un Evento con dependencias operativas.";

type EventMutationSuccess = {
  ok: true;
  event: typeof events.$inferSelect;
};

type EventMutationFailure = {
  ok: false;
  code:
    | "active-event-exists"
    | "event-has-operational-dependencies"
    | "event-is-active"
    | "event-not-found"
    | "invalid-event";
  error: string;
  fieldErrors?: Partial<Record<keyof CreateEventInput, string>>;
  activeEventId?: string;
};

export type EventMutationResult = EventMutationSuccess | EventMutationFailure;

export type CreateEventInput = {
  name: string;
  registrationStartsAt: Date;
  registrationEndsAt: Date;
  startsAt: Date;
  endsAt: Date;
  requiredDepositPercentage?: number;
};

type EventDependencies = {
  hasOperationalDependencies?: (eventId: string) => Promise<boolean> | boolean;
};

export async function createEvent(
  input: CreateEventInput,
): Promise<EventMutationResult> {
  const fieldErrors = validateEventInput(input);

  if (fieldErrors) {
    return {
      ok: false,
      code: "invalid-event",
      error: INVALID_EVENT_ERROR,
      fieldErrors,
    };
  }

  const [event] = await db
    .insert(events)
    .values({
      name: input.name.trim(),
      registrationStartsAt: input.registrationStartsAt,
      registrationEndsAt: input.registrationEndsAt,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      requiredDepositPercentage: input.requiredDepositPercentage ?? 30,
    })
    .returning();

  if (!event) {
    return {
      ok: false,
      code: "invalid-event",
      error: INVALID_EVENT_ERROR,
    };
  }

  return { ok: true, event };
}

export async function activateEvent(
  eventId: string,
): Promise<EventMutationResult> {
  try {
    return await db.transaction(async (tx) => {
      const activeEvent = await tx.query.events.findFirst({
        columns: { id: true },
        where: and(eq(events.active, true), ne(events.id, eventId)),
      });

      if (activeEvent) {
        return {
          ok: false as const,
          code: "active-event-exists" as const,
          error: ACTIVE_EVENT_EXISTS_ERROR,
          activeEventId: activeEvent.id,
        };
      }

      const [event] = await tx
        .update(events)
        .set({ active: true })
        .where(eq(events.id, eventId))
        .returning();

      if (!event) {
        return eventNotFound();
      }

      return { ok: true as const, event };
    });
  } catch (error) {
    if (isActiveUniqueConstraintViolation(error)) {
      return {
        ok: false,
        code: "active-event-exists",
        error: ACTIVE_EVENT_EXISTS_ERROR,
      };
    }

    throw error;
  }
}

export async function deactivateEvent(
  eventId: string,
): Promise<EventMutationResult> {
  const [event] = await db
    .update(events)
    .set({ active: false })
    .where(eq(events.id, eventId))
    .returning();

  if (!event) {
    return eventNotFound();
  }

  return { ok: true, event };
}

export async function setEventVisibility(
  eventId: string,
  visibility: {
    programVisible?: boolean;
    resultsVisible?: boolean;
  },
): Promise<EventMutationResult> {
  const [event] = await db
    .update(events)
    .set(visibility)
    .where(eq(events.id, eventId))
    .returning();

  if (!event) {
    return eventNotFound();
  }

  return { ok: true, event };
}

export async function deleteEvent(
  eventId: string,
  dependencies: EventDependencies = {},
) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return eventNotFound();
  }

  if (event.active) {
    return {
      ok: false as const,
      code: "event-is-active" as const,
      error: ACTIVE_EVENT_DELETION_ERROR,
    };
  }

  const hasOperationalDependencies =
    dependencies.hasOperationalDependencies ?? eventHasOperationalDependencies;

  if (await hasOperationalDependencies(eventId)) {
    return {
      ok: false as const,
      code: "event-has-operational-dependencies" as const,
      error: DEPENDENT_EVENT_DELETION_ERROR,
    };
  }

  await db.delete(events).where(eq(events.id, eventId));

  return { ok: true as const };
}

export async function eventHasOperationalDependencies(_eventId: string) {
  return false;
}

function validateEventInput(input: CreateEventInput) {
  const fieldErrors: EventMutationFailure["fieldErrors"] = {};
  const requiredDepositPercentage = input.requiredDepositPercentage ?? 30;

  if (input.name.trim().length === 0) {
    fieldErrors.name = "Ingresá el nombre del Evento.";
  }

  if (
    !Number.isInteger(requiredDepositPercentage) ||
    requiredDepositPercentage < 0 ||
    requiredDepositPercentage > 100
  ) {
    fieldErrors.requiredDepositPercentage =
      "La seña requerida debe ser un entero entre 0 y 100.";
  }

  if (input.registrationStartsAt >= input.registrationEndsAt) {
    fieldErrors.registrationStartsAt =
      "El inicio de inscripción debe ser anterior al cierre.";
  }

  if (input.startsAt > input.endsAt) {
    fieldErrors.startsAt =
      "El inicio del Evento no puede ser posterior al cierre.";
  }

  if (input.registrationEndsAt > input.endsAt) {
    fieldErrors.registrationEndsAt =
      "El cierre de inscripción no puede ser posterior al cierre del Evento.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return fieldErrors;
  }

  return undefined;
}

function eventNotFound(): EventMutationFailure {
  return {
    ok: false,
    code: "event-not-found",
    error: "No encontramos ese Evento.",
  };
}

function isActiveUniqueConstraintViolation(error: unknown) {
  const databaseError =
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    error.cause
      ? error.cause
      : error;

  return (
    typeof databaseError === "object" &&
    databaseError !== null &&
    "code" in databaseError &&
    databaseError.code === "23505" &&
    "constraint_name" in databaseError &&
    databaseError.constraint_name === "event_single_active_unique"
  );
}
