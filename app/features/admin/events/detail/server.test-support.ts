import {
  eventFormValues,
  type EventFormValues,
} from "@/lib/admin/events/form-values";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import type { createAdminSavedEvent } from "@/lib/events/saved-event-test-support.server";

export type EventRow = Awaited<ReturnType<typeof createAdminSavedEvent>>;

export async function createAdminRequest(eventId: string, body?: FormData) {
  const { request } = await createSignedInAdminRequest({
    body,
    email: `evento.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/eventos/${eventId}`,
    role: "admin",
  });

  return request;
}

/**
 * What the detail form posts for the event's own fields. `changes` overrides
 * single fields, so a test names the one edit it is about instead of restating
 * the whole form.
 */
export function eventFormBody(
  event: EventRow,
  changes: Partial<EventFormValues> = {},
) {
  const body = new FormData();

  body.set("intent", "update");

  for (const [field, value] of Object.entries({
    ...eventFormValues(event),
    ...changes,
  })) {
    body.set(field, value);
  }

  return body;
}
