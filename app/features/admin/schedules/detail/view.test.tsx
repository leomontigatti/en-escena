/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventScheduleDetailView } from "@/features/admin/schedules/detail/view";
import type { EventScheduleDetailLoaderData } from "@/features/admin/schedules/shared";
import { scheduleCategoriesPlaceholder } from "@/features/admin/schedules/view-shared";
import { openRadixSelect } from "@/lib/test-support/radix-select";
import {
  createReactDomTestRenderer,
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

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Eliminar cronograma");
    expect(getButton("Eliminar").disabled).toBe(false);
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

  test("leads the footer with Volver and its chevron, opposite Guardar", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });

    const volver = document.querySelector(
      'a[href*="/administracion/cronogramas"]',
    );
    const actions = volver?.closest("div");

    expect(volver?.textContent).toContain("Volver");
    expect(volver?.querySelector("svg")).not.toBeNull();
    expect(actions?.className).toContain("justify-between");
    expect(actions?.firstElementChild?.textContent).toContain("Volver");
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

  // The switch is the administrator's, and what it offers is exactly what the
  // server would accept: one item at a time, and the opening one disabled with
  // the reasons beside it.
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

  test('disables "Abrir inscripciones" and lists why it is refused', async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildBlockedLoaderData(),
    });
    await openScheduleActionsMenu();

    expect(getButton("Abrir inscripciones").disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "No se pueden abrir las inscripciones de este cronograma.",
    );
    expect(document.body.textContent).toContain(
      "Falta al menos un precio en este evento.",
    );
    expect(document.body.textContent).toContain("El evento ya finalizó.");
  });

  // An open `Cronograma` has nothing to be refused: the alert belongs to the
  // disabled action, so it goes away with it.
  test("hides the reasons once the `Cronograma` is open", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: {
        ...buildOpenLoaderData(),
        registrationOpenBlockers: ["El evento ya finalizó."],
      },
    });

    expect(document.body.textContent).not.toContain(
      "No se pueden abrir las inscripciones de este cronograma.",
    );
  });

  async function openScheduleActionsMenu() {
    await openRadixSelect(
      document.querySelector('button[aria-label="Acciones"]'),
    );
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
