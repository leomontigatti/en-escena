/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventScheduleDetailView } from "@/features/admin/schedules/detail/view";
import type { EventScheduleDetailLoaderData } from "@/features/admin/schedules/shared";
import { scheduleCategoriesPlaceholder } from "@/features/admin/schedules/view-shared";
import { openRadixSelect } from "@/lib/test-support/radix-select";
import {
  createReactDomTestRenderer,
  findButton,
  getButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

describe("EventScheduleDetailView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete-schedule");
    formData.set("id", "schedule_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDetail();

    expect(getButton("Eliminar").disabled).toBe(true);
  });

  // The form plans against what is left: the total capacity and each split
  // capacity say how many places are still free, not just how much was shared out.
  test("shows how many lugares are left for the schedule and for each capacity", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildOccupiedLoaderData(),
    });

    // Read-only decoration inside the control, right after the number.
    expect(document.body.textContent).toContain(" / 4 disponibles");
    expect(document.body.textContent).toContain(" / 2 disponibles");
    // Never as a field description: that slot sits between the label and the
    // control, and pushed every capacity out of line with its group type
    // select. No field of this panel carries a description, so any one
    // appearing here fails.
    expect(
      document.querySelectorAll('[data-slot="field-description"]'),
    ).toHaveLength(0);
    // The suffix is aria-hidden, so the accessible name spells the count out.
    expect(
      document.querySelector('label[for="schedule-capacity-capacity-0"]')
        ?.textContent,
    ).toBe("Cupo. Quedan 2 de 6 lugares.");
    expect(
      document.querySelector("#totalCapacity")?.getAttribute("aria-label"),
    ).toBe("Cupo total. Quedan 4 de 10 lugares.");
  });

  // The suffix plans against the number being typed, not the saved one: the
  // occupied places stay put, so raising or lowering the capacity moves what
  // is left before anything is saved.
  test("follows the typed capacity with the lugares that would be left", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildOccupiedLoaderData(),
    });

    const capacity = document.querySelector<HTMLInputElement>(
      "#schedule-capacity-capacity-0",
    )!;

    await updateReactDomForm(() => setInputValue(capacity, "9"));

    expect(capacity.closest('[data-slot="field"]')?.textContent).toContain(
      " / 5 disponibles",
    );

    await updateReactDomForm(() => setInputValue(capacity, "4"));

    expect(capacity.closest('[data-slot="field"]')?.textContent).toContain(
      " / sin lugares",
    );

    await updateReactDomForm(() => setInputValue(capacity, ""));

    expect(capacity.closest('[data-slot="field"]')?.textContent).not.toContain(
      " / ",
    );
  });

  test("keeps Guardar disabled until something changes", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });

    expect(getButton("Guardar").disabled).toBe(true);

    const name = document.querySelector<HTMLInputElement>("#name")!;

    await updateReactDomForm(() => setInputValue(name, "Tarde"));

    expect(getButton("Guardar").disabled).toBe(false);

    await updateReactDomForm(() => setInputValue(name, "Mañana"));

    expect(getButton("Guardar").disabled).toBe(true);
  });

  // The schedule's accepted categories are the field itself: the chips are what
  // it accepts, and nothing else explains them.
  test("shows the accepted categories as the field's chips", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });

    expect(document.body.textContent).toContain("Categorías");
    expect(document.body.textContent).toContain("Baby · 4–6 · solo, dúo");
    expect(document.body.textContent).not.toContain(
      scheduleCategoriesPlaceholder,
    );
    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[name="categoryIds"]',
        ),
      ).map((input) => input.value),
    ).toEqual(["category_baby"]);
  });

  // An empty selection is a value, not a gap: the schedule accepts every
  // category. The placeholder says so while the field is empty, and only then,
  // so there is no description repeating it once categories are chosen.
  test("reads an empty selection as accepting every category", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildUnrestrictedLoaderData(),
    });

    expect(document.body.textContent).toContain("Todas las categorías");
    expect(document.querySelectorAll('input[name="categoryIds"]')).toHaveLength(
      0,
    );
  });

  // The switch is the administrator's: one item at a time, and the opening one
  // answers with the reasons whenever the server would refuse it.
  test('offers "Abrir inscripciones" while the `Cronograma` is closed', async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });
    await openScheduleActionsMenu();

    expect(getButton("Abrir inscripciones").disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Cerrar inscripciones");
    expect(document.body.textContent).not.toContain(
      "No se pueden abrir las inscripciones de este cronograma.",
    );
  });

  test('offers "Cerrar inscripciones" while the `Cronograma` is open', async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildOpenLoaderData(),
    });
    await openScheduleActionsMenu();

    expect(getButton("Cerrar inscripciones").disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Abrir inscripciones");
  });

  // The item stays enabled whatever the event lacks: the click answers with
  // the reasons, and the page carries no alert about the action.
  test('answers "Abrir inscripciones" with the reasons it is refused', async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildBlockedLoaderData(),
    });

    expect(document.body.textContent).not.toContain(
      "Falta al menos un precio en este evento.",
    );

    await openScheduleActionsMenu();
    await clickMenuItem("Abrir inscripciones");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.querySelector("h2")?.textContent).toBe(
      "No se pueden abrir las inscripciones",
    );
    expect(dialog?.textContent).toContain(
      "Falta al menos un precio en este evento.",
    );
    expect(dialog?.textContent).toContain("El evento ya finalizó.");
    expect(dialog?.querySelector('button[type="submit"]')).toBeNull();
  });

  // Placed and priced choreographies fix the schedule in time: the fields say
  // so before anything is typed, instead of a toast after the submit.
  test("locks date and time and says why while choreographies or prices hold the schedule", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildHeldLoaderData(),
    });

    expect(
      document.querySelector<HTMLInputElement>("#schedule-date-schedule_1")
        ?.readOnly,
    ).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>("#schedule-time-schedule_1")
        ?.value,
    ).toBe("10:00");
    // The locked values still travel in the body.
    expect(
      document.querySelector<HTMLInputElement>('input[name="startTime"]')
        ?.value,
    ).toBe("10:00");
    expect(document.body.textContent).toContain(
      "La fecha y la hora no se pueden cambiar",
    );
    expect(document.body.textContent).toContain(
      "Tiene 2 coreografías asignadas.",
    );
    expect(document.body.textContent).toContain("Lo cubre el precio Función.");
  });

  // A date change refused because a choreography landed meanwhile comes back
  // as the draft; the locked fields must still show and post the saved
  // values, or every later save would be refused too.
  test("locks the saved date and time, not a refused draft of them", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      actionData: {
        status: "error",
        message:
          "No se pueden editar fecha ni hora porque el cronograma tiene dependencias.",
        fieldErrors: {},
        scope: { intent: "update-schedule", recordId: "schedule_1" },
        values: {
          name: "Mañana",
          scheduledDate: "2026-10-11",
          startTime: "12:00",
          awardCeremonyDate: "",
          awardCeremonyTime: "",
          totalCapacity: "10",
          modalityIds: ["modality_1"],
          categoryIds: ["category_baby"],
          scheduleCapacities: [],
        },
      },
      initialDeleteDialogOpen: false,
      loaderData: buildHeldLoaderData(),
    });

    expect(
      document.querySelector<HTMLInputElement>('input[name="scheduledDate"]')
        ?.value,
    ).toBe("2026-10-10");
    expect(
      document.querySelector<HTMLInputElement>('input[name="startTime"]')
        ?.value,
    ).toBe("10:00");
  });

  test("leaves date and time editable on a schedule nothing holds", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });

    expect(
      document.querySelector<HTMLButtonElement>("#schedule-date-schedule_1")
        ?.disabled,
    ).toBe(false);
    expect(
      document.querySelector<HTMLButtonElement>("#startTime")?.disabled,
    ).toBe(false);
    expect(document.body.textContent).not.toContain(
      "La fecha y la hora no se pueden cambiar",
    );
  });

  // The action stays enabled and the click says why it cannot run: an
  // acknowledgment with the reasons, and no destructive button.
  test("answers Eliminar with the reasons while the schedule is held", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildHeldLoaderData(),
    });
    await openScheduleActionsMenu();
    await clickMenuItem("Eliminar");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.querySelector("h2")?.textContent).toBe(
      "No se puede eliminar el cronograma",
    );
    expect(dialog?.textContent).toContain("Tiene 2 coreografías asignadas.");
    expect(dialog?.textContent).toContain(
      "Tiene 1 coreografía retirada asignada.",
    );
    expect(dialog?.querySelector('button[type="submit"]')).toBeNull();
  });

  // A withdrawn choreography holds no place, so the date can move, but its
  // reference to the schedule still blocks the delete.
  test("blocks only the delete while withdrawn choreographies point at the schedule", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildHeldLoaderData({
        coveringPriceNames: [],
        occupyingChoreographyCount: 0,
        withdrawnChoreographyCount: 1,
      }),
    });

    expect(
      document.querySelector<HTMLButtonElement>("#startTime")?.disabled,
    ).toBe(false);

    await openScheduleActionsMenu();
    await clickMenuItem("Eliminar");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("Tiene 1 coreografía retirada asignada.");
  });

  test("asks to confirm Eliminar on a schedule nothing holds", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });
    await openScheduleActionsMenu();
    await clickMenuItem("Eliminar");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.querySelector("h2")?.textContent).toBe(
      "¿Eliminar el cronograma?",
    );
    expect(dialog?.textContent).toContain(
      "Esta acción borra Mañana. No se puede deshacer.",
    );
  });

  async function openScheduleActionsMenu() {
    await openRadixSelect(findButton("Acciones", { exact: true }));
  }

  async function renderDetail(
    props: Partial<ComponentProps<typeof EventScheduleDetailView>> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/cronogramas/schedule_1",
          action: async () => null,
          element: (
            <EventScheduleDetailView
              loaderData={buildLoaderData()}
              scheduleId="schedule_1"
              initialDeleteDialogOpen
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/cronogramas/schedule_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function buildLoaderData(): EventScheduleDetailLoaderData {
  return {
    selectedEventId: "event_1",
    registrationOpenBlockers: [],
    scheduleDependencies: {
      coveringPriceNames: [],
      occupyingChoreographyCount: 0,
      withdrawnChoreographyCount: 0,
    },
    modalities: [
      {
        id: "modality_1",
        eventId: "event_1",
        name: "Jazz",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    categories: [
      {
        id: "category_baby",
        name: "Baby",
        minAge: 4,
        maxAge: 6,
        groupTypes: ["solo", "duo"],
        modalityIds: ["modality_1"],
      },
      {
        id: "category_juvenil",
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["grupal"],
        modalityIds: ["modality_2"],
      },
    ],
    schedules: [
      {
        id: "schedule_1",
        eventId: "event_1",
        name: "Mañana",
        scheduledDate: "2026-10-10",
        startTime: "10:00",
        awardCeremonyDate: null,
        awardCeremonyTime: null,
        totalCapacity: 10,
        registrationOpen: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modalityIds: ["modality_1"],
        categories: [
          {
            id: "category_baby",
            name: "Baby",
            minAge: 4,
            maxAge: 6,
            groupTypes: ["solo", "duo"],
          },
        ],
        categoryIds: ["category_baby"],
        modalities: [],
        availablePlaces: 10,
        occupiedCount: 0,
        scheduleCapacities: [],
      },
    ],
  };
}

function buildUnrestrictedLoaderData(): EventScheduleDetailLoaderData {
  const loaderData = buildLoaderData();
  const [schedule] = loaderData.schedules;

  return {
    ...loaderData,
    schedules: [{ ...schedule, categoryIds: [] }],
  };
}

function buildOccupiedLoaderData(): EventScheduleDetailLoaderData {
  const loaderData = buildLoaderData();
  const [schedule] = loaderData.schedules;

  return {
    ...loaderData,
    schedules: [
      {
        ...schedule,
        availablePlaces: 4,
        occupiedCount: 6,
        scheduleCapacities: [
          {
            id: "schedule_capacity_1",
            scheduleId: schedule.id,
            groupType: "solo",
            capacity: 6,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            availablePlaces: 2,
            occupiedCount: 4,
          },
        ],
      },
    ],
  };
}

function buildOpenLoaderData(): EventScheduleDetailLoaderData {
  const loaderData = buildLoaderData();
  const [schedule] = loaderData.schedules;

  return {
    ...loaderData,
    schedules: [{ ...schedule, registrationOpen: true }],
  };
}

function buildBlockedLoaderData(): EventScheduleDetailLoaderData {
  return {
    ...buildLoaderData(),
    registrationOpenBlockers: [
      "Falta al menos un precio en este evento.",
      "El evento ya finalizó.",
    ],
  };
}

function buildHeldLoaderData(
  scheduleDependencies: EventScheduleDetailLoaderData["scheduleDependencies"] = {
    coveringPriceNames: ["Función"],
    occupyingChoreographyCount: 2,
    withdrawnChoreographyCount: 1,
  },
): EventScheduleDetailLoaderData {
  return { ...buildLoaderData(), scheduleDependencies };
}

async function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!item) {
    throw new Error(`Expected menu item "${label}" to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}
