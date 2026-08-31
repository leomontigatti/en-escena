/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { ChoreographyDetailRouteView } from "@/features/admin/choreographies/detail/view";
import type { ChoreographyDetailLoaderData } from "@/features/admin/choreographies/detail/server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

/**
 * The modalidad is the only select whose change costs a server round-trip, so
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
});

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
                scheduleCapacity: {
                  options: [
                    {
                      id: "schedule_capacity_2",
                      isFull: false,
                      label: "2 de mayo de 2026 - 10:00 hs.",
                    },
                    {
                      id: "schedule_capacity_3",
                      isFull: false,
                      label: "3 de mayo de 2026 - 10:00 hs.",
                    },
                  ],
                  status: "multiple" as const,
                },
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

function getFieldShapes() {
  const shapes: Record<string, string> = {};

  for (const label of Array.from(document.querySelectorAll("label"))) {
    const name = label.textContent?.trim();

    if (!name || !trackedFieldLabels.includes(name)) {
      continue;
    }

    shapes[name] = fieldControl(label)?.querySelector(
      '[data-slot="select-trigger"]',
    )
      ? "select"
      : "static";
  }

  return shapes;
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
    throw new Error("Expected the modalidad select trigger to be rendered.");
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
