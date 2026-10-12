import { describe, expect, test } from "vitest";

import { eventBaseCopy } from "@/lib/events/bases-kernel.server";
import { createModality } from "@/lib/modalities/repository.server";
import {
  createSchedule,
  deleteSchedule,
} from "@/lib/schedules/repository.server";
import {
  action,
  buildScheduleDraft,
  createEventScheduleAdminFixture,
  createScheduleAdminRequest,
  formData,
  routeArgs,
} from "@/lib/admin/events/event-bases.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * A base rejection reaches the administrator from one of two layers: the
 * persistence layer, or the admin action layer when it rejects the submission
 * before persistence runs. Both read the kernel's copy table, so the sentence is
 * the same whichever layer caught it (PRD #719).
 */
describe("`Bases del evento` rejection copy", () => {
  test("a duplicate modality reads the same from persistence and from the admin action", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      ...eventDates(2030),
    });
    await createModality(event.id, { name: "Jazz" });

    const persisted = await createModality(event.id, { name: " jazz " });
    const request = await createSignedInRequest({
      email: "admin.copia.duplicada@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
      body: formData({ intent: "create-modality", name: " jazz " }),
    });
    const actionResult = await action(routeArgs(request.request));

    expect(persisted).toMatchObject({
      ok: false,
      error: eventBaseCopy.modality.duplicateError,
    });
    expect(actionResult).toMatchObject({
      status: "error",
      message: eventBaseCopy.modality.duplicateError,
    });
  });

  test("an invalid modality reads the same from persistence and from the admin action", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      ...eventDates(2030),
    });

    const persisted = await createModality(event.id, { name: "   " });
    const request = await createSignedInRequest({
      email: "admin.copia.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-modality",
        name: "Jazz",
        submodalitiesMode: "replace",
        "submodalities.0.name": "",
      }),
    });
    const actionResult = await action(routeArgs(request.request));

    expect(persisted).toMatchObject({
      ok: false,
      error: eventBaseCopy.modality.invalidError,
    });
    expect(actionResult).toMatchObject({
      status: "error",
      message: eventBaseCopy.modality.invalidError,
    });
  });

  test("an invalid schedule reads the same from persistence and from the admin action", async () => {
    const { event, modalityIds } = await createEventScheduleAdminFixture([
      "Jazz",
    ]);

    const persisted = await createSchedule(event.id, {
      name: "Sábado mañana",
      scheduledDate: "2026-05-02",
      startTime: "09:00",
      totalCapacity: 24,
      modalityIds: [],
    });
    const request = await createScheduleAdminRequest({
      email: "admin.copia.cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
      intent: "create-schedule",
      schedule: buildScheduleDraft({ name: "", modalityIds }),
    });
    const actionResult = await action(routeArgs(request.request));

    expect(persisted).toMatchObject({
      ok: false,
      error: eventBaseCopy.schedule.invalidError,
    });
    expect(actionResult).toMatchObject({
      status: "error",
      message: eventBaseCopy.schedule.invalidError,
    });
  });

  test("a missing schedule is named with its masculine article", async () => {
    const result = await deleteSchedule(crypto.randomUUID());

    expect(result).toEqual({
      ok: false,
      code: "event-bases-not-found",
      error: "No encontramos ese cronograma.",
    });
  });
});
