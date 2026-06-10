import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

const DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE = 30;
const MIN_REQUIRED_DEPOSIT_PERCENTAGE = 0;
const MAX_REQUIRED_DEPOSIT_PERCENTAGE = 100;
const ACTIVE_EVENT_UNIQUE_CONSTRAINT = "event_single_active_unique";

const ACTIVE_EVENT_EXISTS_ERROR =
  "Hay otro Evento activo. Desactivá el Evento activo antes de activar este.";
const INVALID_EVENT_ERROR = "Revisá los datos del Evento.";
const ACTIVE_EVENT_DELETION_ERROR =
  "No se puede borrar un Evento activo. Desactivalo primero.";
const DEPENDENT_EVENT_DELETION_ERROR =
  "No se puede borrar un Evento con dependencias operativas.";
const DEPENDENT_EVENT_EDIT_ERROR =
  "No se pueden editar fechas ni seña con dependencias operativas.";

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

type DeleteEventResult = { ok: true } | EventMutationFailure;

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
      requiredDepositPercentage:
        input.requiredDepositPercentage ?? DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
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
    return await db.transaction(async (tx): Promise<EventMutationResult> => {
      const activeEvent = await tx.query.events.findFirst({
        columns: { id: true },
        where: and(eq(events.active, true), ne(events.id, eventId)),
      });

      if (activeEvent) {
        return activeEventExists(activeEvent.id);
      }

      const [event] = await tx
        .update(events)
        .set({ active: true })
        .where(eq(events.id, eventId))
        .returning();

      if (!event) {
        return eventNotFound();
      }

      return { ok: true, event };
    });
  } catch (error) {
    if (isActiveUniqueConstraintViolation(error)) {
      return activeEventExists();
    }

    throw error;
  }
}

export async function updateEvent(
  eventId: string,
  input: CreateEventInput,
  dependencies: EventDependencies = {},
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

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return eventNotFound();
  }

  const hasOperationalDependencies =
    dependencies.hasOperationalDependencies ?? eventHasOperationalDependencies;

  if (
    (await hasOperationalDependencies(eventId)) &&
    hasStructuralEventChanges(event, input)
  ) {
    return eventHasDependenciesForEdit();
  }

  const [updatedEvent] = await db
    .update(events)
    .set({
      name: input.name.trim(),
      registrationStartsAt: input.registrationStartsAt,
      registrationEndsAt: input.registrationEndsAt,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      requiredDepositPercentage:
        input.requiredDepositPercentage ?? DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
    })
    .where(eq(events.id, eventId))
    .returning();

  if (!updatedEvent) {
    return eventNotFound();
  }

  return { ok: true, event: updatedEvent };
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
): Promise<DeleteEventResult> {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return eventNotFound();
  }

  if (event.active) {
    return eventIsActive();
  }

  const hasOperationalDependencies =
    dependencies.hasOperationalDependencies ?? eventHasOperationalDependencies;

  if (await hasOperationalDependencies(eventId)) {
    return eventHasDependencies();
  }

  await db.delete(events).where(eq(events.id, eventId));

  return { ok: true };
}

export async function eventHasOperationalDependencies(_eventId: string) {
  return false;
}

function validateEventInput(input: CreateEventInput) {
  const fieldErrors: EventMutationFailure["fieldErrors"] = {};
  const requiredDepositPercentage =
    input.requiredDepositPercentage ?? DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE;

  if (input.name.trim().length === 0) {
    fieldErrors.name = "Ingresá el nombre del Evento.";
  }

  if (
    !Number.isInteger(requiredDepositPercentage) ||
    requiredDepositPercentage < MIN_REQUIRED_DEPOSIT_PERCENTAGE ||
    requiredDepositPercentage > MAX_REQUIRED_DEPOSIT_PERCENTAGE
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

function activeEventExists(activeEventId?: string): EventMutationFailure {
  const failure: EventMutationFailure = {
    ok: false,
    code: "active-event-exists",
    error: ACTIVE_EVENT_EXISTS_ERROR,
  };

  if (activeEventId) {
    failure.activeEventId = activeEventId;
  }

  return failure;
}

function eventIsActive(): EventMutationFailure {
  return {
    ok: false,
    code: "event-is-active",
    error: ACTIVE_EVENT_DELETION_ERROR,
  };
}

function eventHasDependencies(): EventMutationFailure {
  return {
    ok: false,
    code: "event-has-operational-dependencies",
    error: DEPENDENT_EVENT_DELETION_ERROR,
  };
}

function eventHasDependenciesForEdit(): EventMutationFailure {
  return {
    ok: false,
    code: "event-has-operational-dependencies",
    error: DEPENDENT_EVENT_EDIT_ERROR,
  };
}

function eventNotFound(): EventMutationFailure {
  return {
    ok: false,
    code: "event-not-found",
    error: "No encontramos ese Evento.",
  };
}

function isActiveUniqueConstraintViolation(error: unknown) {
  const databaseError = getDatabaseError(error);

  return (
    typeof databaseError === "object" &&
    databaseError !== null &&
    "code" in databaseError &&
    databaseError.code === "23505" &&
    "constraint_name" in databaseError &&
    databaseError.constraint_name === ACTIVE_EVENT_UNIQUE_CONSTRAINT
  );
}

function getDatabaseError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    error.cause
  ) {
    return error.cause;
  }

  return error;
}

function hasStructuralEventChanges(
  event: typeof events.$inferSelect,
  input: CreateEventInput,
) {
  const requiredDepositPercentage =
    input.requiredDepositPercentage ?? DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE;

  return (
    event.requiredDepositPercentage !== requiredDepositPercentage ||
    event.registrationStartsAt.getTime() !==
      input.registrationStartsAt.getTime() ||
    event.registrationEndsAt.getTime() !== input.registrationEndsAt.getTime() ||
    event.startsAt.getTime() !== input.startsAt.getTime() ||
    event.endsAt.getTime() !== input.endsAt.getTime()
  );
}
