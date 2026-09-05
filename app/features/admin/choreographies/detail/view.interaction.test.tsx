/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import type { ChoreographyModalityResolution } from "@/features/admin/choreographies/detail/modality.server";
import type { ChoreographyDetailLoaderData } from "@/features/admin/choreographies/detail/server";
import { ChoreographyDetailRouteView } from "@/features/admin/choreographies/detail/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

/**
 * The modality is the only select whose change costs a server round-trip, so
 * it is the only one that can leave the fields it rewrites in an intermediate
 * state. This exercises that window: what the admin reported as the select
 * "reopening" was the three dependent controls collapsing into read-only
 * fields on the click and popping back into selects on the answer, twice in
 * one round-trip and right beside the trigger.
 */
describe("ChoreographyDetailRouteView modality correction", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("keeps the dependent fields as selects while the resolution is in flight", async () => {
    const release = createDeferredResolution();

    await renderIntoDocument(renderer, release.promise);

    const modalityTrigger = findTriggerByText("Jazz");
    expect(modalityTrigger).toBeDefined();

    await openSelect(modalityTrigger);
    await selectOption("Urbano");

    // Mid-round-trip: every dependent control is still a select, held by
    // `disabled` rather than swapped for another kind of field.
    expect(getFieldShapes()).toEqual({
      Cronograma: "select",
      Modalidad: "select",
      "Nivel de experiencia": "select",
      Submodalidad: "select",
    });
    expect(isFieldDisabled("Submodalidad")).toBe(true);
    expect(isFieldDisabled("Cronograma")).toBe(true);
    expect(isFieldDisabled("Modalidad")).toBe(false);
    expect(document.contains(modalityTrigger ?? null)).toBe(true);

    release.resolve();
    await settle();

    // And once it answers, the same controls stay selects and come back live.
    expect(getFieldShapes()).toEqual({
      Cronograma: "select",
      Modalidad: "select",
      "Nivel de experiencia": "select",
      Submodalidad: "select",
    });
    expect(isFieldDisabled("Submodalidad")).toBe(false);
    expect(findTriggerByText("Urbano")).toBeDefined();
  });

  /**
   * Occupancy belongs to the options of a select. A destination modality with a
   * single compatible capacity offers none: the capacity arrives preselected and
   * read-only, like the `auto` status of registration, and the resolution gives it
   * no label at all: the field composes the bare date-time itself.
   */
  test("previews a locked single capacity as a read-only field with no occupancy", async () => {
    await renderIntoDocument(renderer, Promise.resolve(), {
      options: [
        {
          id: "schedule_capacity_2",
          isFull: false,
          schedule: {
            name: "Cronograma 2",
            scheduledDate: "2026-05-02",
            startTime: "10:00:00",
          },
        },
      ],
      status: "auto",
    });

    await openSelect(findTriggerByText("Jazz"));
    await selectOption("Urbano");
    await settle();

    expect(getFieldShape("Cronograma")).toBe("static");
    expect(readFieldValue("Cronograma")).toBe("2 de mayo de 2026 - 10:00 hs.");
    expect(readFieldValue("Cronograma")).not.toContain("ocupados");
  });
});

/**
 * The capacity select stopped being the odd one out: it used to write on
 * change, so moving the dropdown was the reassignment. It now holds the choice
 * like the modality correction next to it and waits for the page's `Guardar`.
 */
describe("ChoreographyDetailRouteView schedule capacity reassignment", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("holds the picked capacity until `Guardar` writes it", async () => {
    const submissions: Record<string, string>[] = [];

    await renderScheduleCapacityDetail(renderer, submissions);

    await openSelect(findTriggerByText("1 de mayo de 2026 - 14:00 hs."));
    await selectOption("2 de mayo de 2026 - 10:00 hs.");

    // The pick alone posts nothing: it only leaves the field showing the
    // destination and the `Guardar` live.
    expect(submissions).toEqual([]);
    expect(findTriggerByText("2 de mayo de 2026 - 10:00 hs.")).toBeDefined();

    await clickReactDomButton("Guardar");
    await settle();

    expect(submissions).toEqual([
      {
        assignedScheduleCapacityId: "schedule_capacity_2",
        intent: "update-schedule-capacity",
      },
    ]);
  });

  test("holds the roster inputs while a picked capacity waits for `Guardar`", async () => {
    // One `Guardar` can only mean one form, so the exclusion runs both ways:
    // with a capacity pending, the roster inputs are held the way a pending
    // modality correction holds them. Otherwise the button would write the
    // capacity and drop the roster edits typed beside it, unannounced.
    await renderScheduleCapacityDetail(renderer, []);

    expect(isNameInputDisabled()).toBe(false);

    await openSelect(findTriggerByText("1 de mayo de 2026 - 14:00 hs."));
    await selectOption("2 de mayo de 2026 - 10:00 hs.");

    expect(isNameInputDisabled()).toBe(true);
  });

  test("stops offering the capacity select while the roster form is dirty", async () => {
    // The other direction, and the same one the modality correction takes: a
    // dirty roster collapses the capacity into a read-only field, so the
    // administrator cannot start a second pending save the button would have
    // to choose between.
    const submissions: Record<string, string>[] = [];

    await renderScheduleCapacityDetail(renderer, submissions);

    await typeIntoNameInput("Danza solar");

    expect(getFieldShape("Cronograma")).toBe("static");

    // And the button still belongs to the roster: it confirms first.
    await clickReactDomButton("Guardar");
    await settle();

    expect(submissions).toEqual([]);
    expect(document.body.textContent).toContain("Confirmar");
  });

  test("returns the field to the saved capacity when the save is rejected", async () => {
    // `schedule-capacity-full` is a race the option list cannot filter out, so
    // the rejection path stays live: nothing was written, and the select must
    // not be left claiming a capacity —and a price key— it does not have.
    await renderScheduleCapacityDetail(renderer, [], {
      message: "El cronograma elegido ya no tiene lugar.",
      status: "error" as const,
    });

    await openSelect(findTriggerByText("1 de mayo de 2026 - 14:00 hs."));
    await selectOption("2 de mayo de 2026 - 10:00 hs.");
    await clickReactDomButton("Guardar");
    await settle();

    expect(findTriggerByText("1 de mayo de 2026 - 14:00 hs.")).toBeDefined();
    expect(findTriggerByText("2 de mayo de 2026 - 10:00 hs.")).toBeUndefined();
  });
});

async function renderScheduleCapacityDetail(
  renderer: ReturnType<typeof createReactDomTestRenderer>,
  submissions: Record<string, string>[],
  actionResult: unknown = { message: "Guardado", status: "success" as const },
) {
  const loaderData = buildLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/coreografias/choreo_1",
        action: async ({ request }) => {
          const formData = await request.formData();

          submissions.push(
            Object.fromEntries(
              Array.from(formData.entries()).map(([key, value]) => [
                key,
                String(value),
              ]),
            ),
          );

          return actionResult;
        },
        element: (
          <ChoreographyDetailRouteView
            loaderData={{
              ...loaderData,
              // Two destinations, so the standalone capacity select is the one
              // filling the slot.
              scheduleCapacity: {
                blockers: [],
                canReassign: true,
                options: [
                  {
                    id: "schedule_capacity_1",
                    isFull: false,
                    label: "1 de mayo de 2026 - 14:00 hs.",
                  },
                  {
                    id: "schedule_capacity_2",
                    isFull: false,
                    label: "2 de mayo de 2026 - 10:00 hs.",
                  },
                ],
              },
            }}
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/coreografias/choreo_1"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function createDeferredResolution() {
  let resolve = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = () => resolvePromise();
  });

  return { promise, resolve: () => resolve() };
}

async function renderIntoDocument(
  renderer: ReturnType<typeof createReactDomTestRenderer>,
  held: Promise<void>,
  scheduleCapacity: ChoreographyModalityResolution["scheduleCapacity"] = {
    options: [
      {
        id: "schedule_capacity_2",
        isFull: false,
        label: "2 de mayo de 2026 - 10:00 hs. · 1/5 ocupados",
      },
      {
        id: "schedule_capacity_3",
        isFull: false,
        label: "3 de mayo de 2026 - 10:00 hs. · 0/5 ocupados",
      },
    ],
    status: "multiple",
  },
) {
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/coreografias/choreo_1",
        action: async () => {
          await held;

          return {
            intent: "resolve-modality" as const,
            result: {
              ok: true as const,
              resolution: {
                category: { id: "category_9", name: "Juvenil Urbano" },
                experienceLevel: {
                  options: [{ id: "amateur", name: "Amateur" }],
                  required: true,
                },
                modalityId: "modality_2",
                scheduleCapacity,
                submodality: {
                  options: [{ id: "submodality_9", name: "Hip hop" }],
                  required: true,
                },
              },
            },
          };
        },
        element: <ChoreographyDetailRouteView loaderData={buildLoaderData()} />,
      },
    ],
    { initialEntries: ["/administracion/coreografias/choreo_1"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function getNameInput() {
  return document.querySelector<HTMLInputElement>('input[name="name"]');
}

function isNameInputDisabled() {
  return getNameInput()?.disabled ?? false;
}

async function typeIntoNameInput(value: string) {
  const input = getNameInput();

  if (!input) {
    throw new Error("Expected the `Nombre` input to be rendered.");
  }

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
}

function getFieldShape(label: string) {
  return fieldControl(findLabel(label))?.querySelector(
    '[data-slot="select-trigger"]',
  )
    ? "select"
    : "static";
}

function getFieldShapes() {
  const shapes: Record<string, string> = {};

  for (const label of Array.from(document.querySelectorAll("label"))) {
    const name = label.textContent?.trim();

    if (!name || !trackedFieldLabels.includes(name)) {
      continue;
    }

    shapes[name] = getFieldShape(name);
  }

  return shapes;
}

/**
 * A read-only field is a disabled `input`, so what the administrator reads is
 * its value and not the element's text.
 */
function readFieldValue(label: string) {
  const input = fieldControl(findLabel(label))?.querySelector<HTMLInputElement>(
    'input:not([type="hidden"])',
  );

  if (!input) {
    throw new Error(`Expected the field "${label}" to render an input.`);
  }

  return input.value;
}

function isFieldDisabled(label: string) {
  const trigger = fieldControl(findLabel(label))?.querySelector(
    '[data-slot="select-trigger"]',
  );

  return trigger?.hasAttribute("disabled") ?? false;
}

function fieldControl(label: Element | undefined) {
  return label?.parentElement ?? undefined;
}

function findLabel(text: string) {
  return Array.from(document.querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

function findTriggerByText(text: string) {
  return Array.from(
    document.querySelectorAll('[data-slot="select-trigger"]'),
  ).find((candidate) => candidate.textContent?.includes(text)) as
    | HTMLElement
    | undefined;
}

const trackedFieldLabels = [
  "Cronograma",
  "Modalidad",
  "Nivel de experiencia",
  "Submodalidad",
];

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function openSelect(trigger: HTMLElement | undefined) {
  if (!trigger) {
    throw new Error("Expected the select trigger to be rendered.");
  }

  trigger.hasPointerCapture ??= () => false;
  trigger.setPointerCapture ??= () => {};
  trigger.releasePointerCapture ??= () => {};

  await act(async () => {
    trigger.dispatchEvent(pointerEvent("pointerdown"));
    await Promise.resolve();
  });
  await settle();
}

/**
 * Radix selects on `Enter` over the focused item. jsdom has no layout, so the
 * pointer path Radix uses for a mouse cannot be replayed faithfully; the
 * keyboard one reaches the same `onValueChange`.
 */
async function selectOption(text: string) {
  const option = Array.from(
    document.querySelectorAll('[data-slot="select-item"]'),
  ).find((candidate) => candidate.textContent?.trim() === text);

  if (!option) {
    throw new Error(`Expected the option "${text}" to be rendered.`);
  }

  await act(async () => {
    option.dispatchEvent(pointerEvent("pointermove"));
    await Promise.resolve();
  });

  await act(async () => {
    option.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      }),
    );
    await Promise.resolve();
  });
}

function pointerEvent(type: string) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerType", { value: "mouse" });

  return event;
}

function buildLoaderData(): ChoreographyDetailLoaderData {
  return {
    availableDancers: [
      { active: true, firstName: "Ana", id: "dancer_1", lastName: "Paz" },
    ],
    availableProfessors: [
      { active: true, firstName: "Luz", id: "professor_1", lastName: "Suárez" },
    ],
    backToList: "/administracion/coreografias",
    canEdit: true,
    choreography: {
      academyId: "academy_1",
      academyName: "Academia Norte",
      categoryId: "category_1",
      categoryName: "Juvenil",
      choreographyNumber: 1,
      dancers: [
        {
          active: true,
          ageAtEventStart: 14,
          firstName: "Ana",
          hasEvidence: false,
          id: "dancer_1",
          lastName: "Paz",
        },
      ],
      experienceLevelId: "amateur",
      experienceLevelName: "Amateur",
      experienceLevelOptions: [
        { id: "amateur", name: "Amateur" },
        { id: "profesional", name: "Profesional" },
      ],
      groupType: "solo",
      hasPresentation: false,
      id: "choreo_1",
      modalityId: "modality_1",
      modalityName: "Jazz",
      musicDownloadUrl: null,
      musicStorageKey: null,
      name: "Danza lunar",
      operationalStatus: { code: "complete", pendingItems: [] },
      professors: [
        {
          active: true,
          firstName: "Luz",
          id: "professor_1",
          lastName: "Suárez",
        },
      ],
      requiresExperienceLevel: true,
      scheduleCapacityId: "schedule_capacity_1",
      scheduleId: "schedule_1",
      scheduleLabel: "1 de mayo de 2026 - 14:00 hs.",
      submodalityId: "submodality_1",
      submodalityName: "Lyrical",
    },
    deletion: { canDelete: true, blockers: [] },
    experienceLevel: { canReassign: true },
    modality: {
      blockers: [],
      canCorrect: true,
      options: [
        { hasCompatibleScheduleCapacity: true, id: "modality_1", name: "Jazz" },
        {
          hasCompatibleScheduleCapacity: true,
          id: "modality_2",
          name: "Urbano",
        },
      ],
    },
    scheduleCapacity: {
      blockers: [],
      canReassign: true,
      options: [
        {
          id: "schedule_capacity_1",
          isFull: false,
          label: "1 de mayo de 2026 - 14:00 hs.",
        },
      ],
    },
    selectedEventId: "event_1",
    submodalityOptions: [{ id: "submodality_1", name: "Lyrical" }],
  };
}
