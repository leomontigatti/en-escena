import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scheduleCapacities } from "@/db/schema";
import { createModality } from "@/lib/modalities/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  action,
  buildScheduleCapacityDraft,
  buildScheduleDraft,
  createDeleteScheduleAdminRequest,
  createEventScheduleAdminFixture,
  createScheduleAdminRequest,
  createScheduleCapacityAdminRequest,
  createSavedEvent,
  createSignedInRequest,
  expectCreated,
  expectScheduleCapacityBreakdown,
  findSavedScheduleById,
  findSavedScheduleByName,
  expectThrownResponse,
  listSavedScheduleCapacities,
  loader,
  renderBloqueHorarioDetailRoute,
  renderBloquesHorariosRoute,
  renderNuevoBloqueHorarioRoute,
  renderPriceNewErrorRoute,
  renderScheduleDetailErrorRoute,
  routeArgs,
} from "./event-bases.test-helpers";

installDatabaseTestHooks();

describe.sequential(
  "administracion Cronogramas de Bases del evento routes",
  () => {
    test("renders cronogramas as a browse list with ocupación and detail links", async () => {
      const { event, modalityIds } = await createEventScheduleAdminFixture();

      const schedule = await expectCreated(
        createSchedule(event.id, {
          name: "Sábado mañana",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 24,
          modalityIds,
        }),
      );

      await expectCreated(
        createScheduleCapacity(schedule.id, {
          groupType: "solo",
          capacity: 8,
        }),
      );

      const data = await loader(
        routeArgs(
          (
            await createSignedInRequest({
              email: "admin.lista.bloques.ocupacion@example.com",
              role: "admin",
              requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
            })
          ).request,
        ),
      );
      const markup = renderBloquesHorariosRoute(data);

      expect(markup).toContain("Ocupación");
      expect(markup).toContain("8/24");
      expect(markup).toContain("Sábado Mañana");
      expect(markup).toContain("2 de mayo de 2026");
      expect(markup).toContain("09:00");
      expect(markup).toContain("Jazz");
      expect(markup).toContain("Danzas Urbanas");
      expect(markup).toContain(`/administracion/cronogramas/${schedule.id}`);
      expect(markup).toContain("/administracion/cronogramas/nuevo");
      expect(markup).not.toContain('name="intent" value="create-schedule"');
      expect(markup).not.toContain('name="intent" value="delete-schedule"');
      expect(markup).not.toContain(
        'name="intent" value="create-schedule-capacity"',
      );
    });

    test("renders dedicated create and detail routes for cronogramas", async () => {
      const { event, modalities } = await createEventScheduleAdminFixture([
        "Jazz",
      ]);

      const schedule = await expectCreated(
        createSchedule(event.id, {
          name: "Domingo tarde",
          scheduledDate: "2026-05-03",
          startTime: "15:00",
          totalCapacity: 18,
          modalityIds: [modalities[0].id],
        }),
      );

      const data = await loader(
        routeArgs(
          (
            await createSignedInRequest({
              email: "admin.rutas.bloques@example.com",
              role: "admin",
              requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
            })
          ).request,
        ),
      );

      const createMarkup = renderNuevoBloqueHorarioRoute(data);
      const detailMarkup = renderBloqueHorarioDetailRoute(data, schedule.id);

      expect(createMarkup).toContain("Nuevo cronograma");
      expect(createMarkup).toContain('name="intent" value="create-schedule"');
      expect(createMarkup).toContain("Dividir cupo");
      expect(detailMarkup).toContain("Editar cronograma");
      expect(detailMarkup).toContain('name="intent" value="update-schedule"');
      expect(detailMarkup).not.toContain("Cupos de cronograma");
      expect(detailMarkup).toContain("Dividir cupo");
    });

    test("creates, edits and deletes Cronogramas through the admin action", async () => {
      const { event, modalities, modalityIds } =
        await createEventScheduleAdminFixture();
      const scheduleRequest = await createScheduleAdminRequest({
        email: "admin.crea.bloque@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
        intent: "create-schedule",
        schedule: buildScheduleDraft({
          modalityIds,
        }),
      });

      const createScheduleResponse = await expectThrownResponse(
        action(routeArgs(scheduleRequest.request)),
        302,
      );
      expect(createScheduleResponse.headers.get("location")).toMatch(
        /\/administracion\/cronogramas\/[^?]+\?notificacion=cronograma-guardado/,
      );

      const schedule = await findSavedScheduleByName("Sábado Mañana");
      expect(schedule).toMatchObject({
        eventId: event.id,
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 24,
      });

      const data = await loader(
        routeArgs(
          (
            await createSignedInRequest({
              email: "admin.lista.bloques@example.com",
              role: "admin",
              requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
            })
          ).request,
        ),
      );
      const markup = renderBloquesHorariosRoute(data);

      expect(markup).toContain("Sábado Mañana");
      expect(markup).toContain("2 de mayo de 2026");
      expect(markup).toContain("09:00");
      expect(markup).toContain("0/24");
      expect(markup).toContain("Jazz");
      expect(markup).toContain("Danzas Urbanas");

      const urbanas = modalities.find(
        (modality) => modality.name === "Danzas Urbanas",
      );
      const editScheduleRequest = await createScheduleAdminRequest({
        email: "admin.edita.bloque@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
        intent: "update-schedule",
        scheduleId: schedule?.id ?? "",
        schedule: buildScheduleDraft({
          name: "Sábado tarde",
          scheduledDate: "2026-05-02",
          startTime: "14:30",
          totalCapacity: "18",
          modalityIds: [urbanas?.id ?? ""],
        }),
      });

      const updateScheduleResponse = await expectThrownResponse(
        action(routeArgs(editScheduleRequest.request)),
        302,
      );
      expect(updateScheduleResponse.headers.get("location")).toContain(
        "notificacion=cronograma-guardado",
      );
      await expect(findSavedScheduleById(schedule?.id ?? "")).resolves.toMatchObject({
        name: "Sábado Tarde",
        startTime: "14:30",
        totalCapacity: 18,
      });

      const deleteScheduleRequest = await createDeleteScheduleAdminRequest({
        email: "admin.borra.bloque@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
        scheduleId: schedule?.id ?? "",
      });

      const deleteScheduleResponse = await expectThrownResponse(
        action(routeArgs(deleteScheduleRequest.request)),
        302,
      );
      expect(deleteScheduleResponse.headers.get("location")).toBe(
        "/administracion/cronogramas?notificacion=cronograma-eliminado",
      );
      await expect(findSavedScheduleById(schedule?.id ?? "")).resolves.toBeUndefined();
    });

    test("creates, edits and deletes cupos de cronograma inside cronogramas through the admin action", async () => {
      const { event, modalities } = await createEventScheduleAdminFixture([
        "Jazz",
      ]);
      const scheduleRequest = await createScheduleAdminRequest({
        email: "admin.crea.bloque.cupo-cronograma@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
        intent: "create-schedule",
        schedule: buildScheduleDraft({
          totalCapacity: "12",
          modalityIds: [modalities[0].id],
        }),
      });

      await expectThrownResponse(
        action(routeArgs(scheduleRequest.request)),
        302,
      );

      const schedule = await findSavedScheduleByName("Sábado Mañana");
      const createScheduleCapacityRequest =
        await createScheduleCapacityAdminRequest({
        email: "admin.crea.cupo-cronograma@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
        intent: "create-schedule-capacity",
        scheduleId: schedule?.id ?? "",
        scheduleCapacity: buildScheduleCapacityDraft(),
      });

      const createScheduleCapacityResponse = await expectThrownResponse(
        action(routeArgs(createScheduleCapacityRequest.request)),
        302,
      );
      expect(createScheduleCapacityResponse.headers.get("location")).toContain(
        "notificacion=cupo-cronograma-guardado",
      );

      const [scheduleCapacity] = await listSavedScheduleCapacities(
        schedule?.id ?? "",
      );
      expect(scheduleCapacity).toMatchObject({
        groupType: "solo",
        capacity: 8,
      });

      const data = await loader(
        routeArgs(
          (
            await createSignedInRequest({
              email: "admin.lista.cupos-cronograma@example.com",
              role: "admin",
              requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
            })
          ).request,
        ),
      );
      const markup = renderBloqueHorarioDetailRoute(data, schedule?.id ?? "");

      expect(markup).not.toContain("Cupos de cronograma");
      expect(markup).toContain('name="scheduleCapacities.0.groupType"');
      expect(markup).toContain('name="scheduleCapacities.0.capacity"');

      const editScheduleCapacityRequest =
        await createScheduleCapacityAdminRequest({
        email: "admin.edita.cupo-cronograma@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
        intent: "update-schedule-capacity",
        scheduleId: schedule?.id ?? "",
        scheduleCapacity: buildScheduleCapacityDraft({
          id: scheduleCapacity?.id ?? "",
          groupType: "trio",
          capacity: "4",
        }),
      });

      const updateScheduleCapacityResponse = await expectThrownResponse(
        action(routeArgs(editScheduleCapacityRequest.request)),
        302,
      );
      expect(updateScheduleCapacityResponse.headers.get("location")).toContain(
        "notificacion=cupo-cronograma-guardado",
      );
      await expect(
        db.query.scheduleCapacities.findFirst({
          where: eq(scheduleCapacities.id, scheduleCapacity?.id ?? ""),
        }),
      ).resolves.toMatchObject({
        groupType: "trio",
        capacity: 4,
      });

      const deleteScheduleCapacityRequest =
        await createScheduleCapacityAdminRequest({
        email: "admin.borra.cupo-cronograma@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
        intent: "delete-schedule-capacity",
        scheduleId: schedule?.id ?? "",
        scheduleCapacityId: scheduleCapacity?.id ?? "",
      });

      const deleteScheduleCapacityResponse = await expectThrownResponse(
        action(routeArgs(deleteScheduleCapacityRequest.request)),
        302,
      );
      expect(deleteScheduleCapacityResponse.headers.get("location")).toContain(
        "notificacion=cupo-cronograma-eliminado",
      );
      await expect(listSavedScheduleCapacities(schedule?.id ?? "")).resolves.toEqual([]);
    });

    test("saves inline cupos de cronograma through the cronograma form", async () => {
      const { event, modalities } = await createEventScheduleAdminFixture([
        "Jazz",
      ]);
      const createScheduleRequest = await createScheduleAdminRequest({
        email: "admin.inline.cupos-cronograma@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
        intent: "create-schedule",
        schedule: buildScheduleDraft({
          name: "Domingo tarde",
          scheduledDate: "2026-05-03",
          startTime: "15:00",
          totalCapacity: "12",
          modalityIds: [modalities[0].id],
          scheduleCapacities: [
            buildScheduleCapacityDraft({ capacity: "5" }),
            buildScheduleCapacityDraft({
              groupType: "grupal",
              capacity: "7",
            }),
          ],
        }),
      });

      await expectThrownResponse(
        action(routeArgs(createScheduleRequest.request)),
        302,
      );

      const schedule = await findSavedScheduleByName("Domingo Tarde");
      const createdEntries = await listSavedScheduleCapacities(
        schedule?.id ?? "",
      );
      const soloEntry = createdEntries.find(
        (entry) => entry.groupType === "solo",
      );

      expect(createdEntries).toHaveLength(2);
      expectScheduleCapacityBreakdown(createdEntries, [
        { groupType: "solo", capacity: 5 },
        { groupType: "grupal", capacity: 7 },
      ]);

      const updateScheduleRequest = await createScheduleAdminRequest({
        email: "admin.inline.cupos-cronograma.edita@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
        intent: "update-schedule",
        scheduleId: schedule?.id ?? "",
        schedule: buildScheduleDraft({
          name: "Domingo tarde",
          scheduledDate: "2026-05-03",
          startTime: "15:00",
          totalCapacity: "12",
          modalityIds: [modalities[0].id],
          scheduleCapacities: [
            buildScheduleCapacityDraft({
              id: soloEntry?.id ?? "",
              groupType: "duo",
              capacity: "3",
            }),
            buildScheduleCapacityDraft({
              groupType: "trio",
              capacity: "4",
            }),
          ],
        }),
      });

      await expectThrownResponse(
        action(routeArgs(updateScheduleRequest.request)),
        302,
      );

      const updatedEntries = await listSavedScheduleCapacities(
        schedule?.id ?? "",
      );

      expect(updatedEntries).toHaveLength(2);
      expect(updatedEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: soloEntry?.id, groupType: "duo" }),
        ]),
      );
      expectScheduleCapacityBreakdown(updatedEntries, [
        { groupType: "duo", capacity: 3 },
        { groupType: "trio", capacity: 4 },
      ]);
      expect(updatedEntries.some((entry) => entry.groupType === "grupal")).toBe(
        false,
      );
    });

    test("does not leak cupo de cronograma field errors into unrelated forms", async () => {
      const event = await createSavedEvent("Regional 2026");
      const modality = await expectCreated(
        createModality(event.id, { name: "Jazz" }),
      );
      const schedule = await expectCreated(
        createSchedule(event.id, {
          name: "Sábado mañana",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 24,
          modalityIds: [modality.id],
        }),
      );
      const request = await createSignedInRequest({
        email: "admin.errores.precios.bloques@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      });
      const data = await loader(routeArgs(request.request));
      await expectCreated(
        createScheduleCapacity(schedule.id, {
          groupType: "solo",
          capacity: 6,
        }),
      );
      const refreshedData = await loader(routeArgs(request.request));

      const priceMarkup = renderPriceNewErrorRoute(data, {
        status: "error",
        message: "Revisá los datos del precio.",
        fieldErrors: { amount: "Este campo es obligatorio." },
        scope: {
          intent: "create-price",
        },
      });
      const scheduleMarkup = renderScheduleDetailErrorRoute(data, schedule.id, {
        status: "error",
        message: "Revisá los datos del cupo de cronograma.",
        fieldErrors: {
          "scheduleCapacities.0.capacity": "Este campo es obligatorio.",
        },
        scope: {
          intent: "update-schedule",
          recordId: schedule.id,
        },
      });
      const updateScheduleMarkup = renderBloqueHorarioDetailRoute(
        refreshedData,
        schedule.id,
        {
          status: "error",
          message: "Revisá los datos del cupo de cronograma.",
          fieldErrors: {
            "scheduleCapacities.0.capacity": "Ajustá el cupo.",
          },
          scope: {
            intent: "update-schedule",
            recordId: schedule.id,
          },
        },
      );

      expect(priceMarkup).not.toContain("Revisá los datos del precio.");
      expect(scheduleMarkup).not.toContain(
        "Revisá los datos del cupo de cronograma.",
      );
      expect(scheduleMarkup).not.toContain("Este campo es obligatorio.");
      expect(updateScheduleMarkup).not.toContain("Ajustá el cupo.");
      expect(updateScheduleMarkup).not.toContain("Este campo es obligatorio.");
    });

    test("returns inline cupo required errors from the cronograma action", async () => {
      const event = await createSavedEvent("Regional 2026");
      const modality = await expectCreated(
        createModality(event.id, { name: "Jazz" }),
      );
      const request = await createScheduleAdminRequest({
        email: "admin.inline.cupos.requeridos@example.com",
        role: "admin",
        requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
        intent: "create-schedule",
        schedule: buildScheduleDraft({
          name: "Domingo tarde",
          scheduledDate: "2026-05-03",
          startTime: "15:00",
          totalCapacity: "12",
          modalityIds: [modality.id],
          scheduleCapacities: [
            buildScheduleCapacityDraft({
              groupType: "",
              capacity: "",
            }),
            buildScheduleCapacityDraft({
              groupType: "grupal",
              capacity: "7",
            }),
          ],
        }),
      });

      await expect(action(routeArgs(request.request))).resolves.toEqual({
        status: "error",
        message: "Revisá los datos del cronograma.",
        fieldErrors: {
          "scheduleCapacities.0.groupType": "Este campo es obligatorio.",
          "scheduleCapacities.0.capacity": "Este campo es obligatorio.",
        },
        scope: {
          intent: "create-schedule",
        },
        values: {
          name: "Domingo tarde",
          scheduledDate: "2026-05-03",
          startTime: "15:00",
          totalCapacity: "12",
          modalityIds: [modality.id],
          scheduleCapacities: [
            { groupType: "", capacity: "" },
            { groupType: "grupal", capacity: "7" },
          ],
        },
      });
    });
  },
);
