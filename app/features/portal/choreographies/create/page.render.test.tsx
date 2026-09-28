/** @vitest-environment jsdom */

// The registration page walked as an academy walks it, against a stub action
// that answers each intent the way the server does (#1236).

import { act } from "react";
import { createMemoryRouter, redirect, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  CREATE_CHOREOGRAPHY_INTENT,
  RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT,
  type RegistrationResolution,
} from "@/features/portal/choreographies/create/flow";
import { CreateChoreographyPage } from "@/features/portal/choreographies/create/page";
import type { CreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

const loaderData: CreateChoreographyRouteData = {
  eventId: "event_1",
  activeDancers: [
    { id: "dancer_1", firstName: "Ana", lastName: "Paz", active: true },
    { id: "dancer_2", firstName: "Bea", lastName: "Lagos", active: true },
  ],
  activeProfessors: [
    { id: "professor_1", firstName: "Luz", lastName: "Suárez", active: true },
  ],
  registrationBaseOptions: {
    modalities: [{ id: "modality_1", name: "Jazz" }],
    submodalities: [
      { id: "submodality_1", modalityId: "modality_1", name: "Lírico" },
    ],
  },
};

type StubAnswers = {
  create?: unknown;
  resolve: unknown;
};

function renderPage(answers: StubAnswers) {
  const submissions: FormData[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/portal/coreografias/crear",
        action: async ({ request }) => {
          const formData = await request.formData();
          submissions.push(formData);

          if (
            formData.get("intent") === RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT
          ) {
            return answers.resolve;
          }

          if (answers.create) {
            return answers.create;
          }

          throw redirect("/portal/coreografias?creada=1");
        },
        element: <CreateChoreographyPage loaderData={loaderData} />,
      },
      { path: "/portal/coreografias", element: <p>Lista de coreografías</p> },
    ],
    { initialEntries: ["/portal/coreografias/crear"] },
  );

  return { router, submissions };
}

function resolved(resolution: RegistrationResolution) {
  return {
    intent: RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT,
    result: { ok: true, resolution },
  };
}

function buildResolution(
  overrides: Partial<RegistrationResolution> = {},
): RegistrationResolution {
  return {
    categoryAgeBasis: 14,
    category: { status: "resolved", id: "category_1", name: "Juvenil" },
    categoryCalculationMode: "oldest",
    dancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        ageAtEventStart: 14,
      },
    ],
    experienceLevel: { required: false, options: [] },
    groupType: "solo",
    schedule: {
      status: "auto",
      canConfirm: true,
      scheduleCapacityId: "capacity_1",
      options: [buildScheduleOption("capacity_1", "2026-05-03")],
    },
    ...overrides,
  };
}

function buildScheduleOption(id: string, scheduledDate: string) {
  return {
    id,
    scheduleId: `schedule_${id}`,
    scheduleCapacityId: id,
    capacity: 8,
    groupType: "solo" as const,
    usesGlobalCapacity: false,
    schedule: {
      id: `schedule_${id}`,
      name: "Bloque",
      scheduledDate,
      startTime: "10:00",
    },
  };
}

function getHeading() {
  return document.querySelector("h2")?.textContent;
}

function getStepCounter() {
  return Array.from(document.querySelectorAll("header span")).find((span) =>
    span.textContent?.startsWith("Paso"),
  )?.textContent;
}

function isNextDisabled() {
  return (findButton("Siguiente", { exact: true }) as HTMLButtonElement)
    .disabled;
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  throw new Error("The page never reached the expected state.");
}

async function clickLabel(text: string) {
  const label = Array.from(document.querySelectorAll("label")).find(
    (candidate) => candidate.textContent === text,
  );

  if (!label) {
    throw new Error(`Expected a label "${text}".`);
  }

  await updateReactDomForm(() => {
    label.click();
  });
}

async function goNext() {
  await clickReactDomButton("Siguiente", { exact: true });
}

async function fillFirstStep() {
  const name = document.querySelector<HTMLInputElement>("input[name='name']");

  await updateReactDomForm(() => {
    setInputValue(name as HTMLInputElement, "Danza de la Luna");
  });
  await goNext();
}

async function pickDancerAndResolve(nextHeading: string) {
  await clickLabel("Ana Paz");
  await goNext();
  await waitFor(() => getHeading() === nextHeading);
}

describe("the choreography registration page", () => {
  test("asks the name, modality and submodality on one step, with an only option chosen for the academy", async () => {
    const { router } = renderPage({ resolve: resolved(buildResolution()) });
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getHeading()).toBe("La coreografía");
    expect(getStepCounter()).toBe("Paso 1 de 4");
    expect(
      document.querySelectorAll('[role="radio"][aria-checked="true"]'),
    ).toHaveLength(2);
    expect(isNextDisabled()).toBe(true);

    await fillFirstStep();

    expect(getHeading()).toBe("¿Quiénes bailan?");
  });

  test("skips the category step when the resolution leaves nothing to choose, and saves", async () => {
    const { router, submissions } = renderPage({
      resolve: resolved(buildResolution()),
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await fillFirstStep();
    await pickDancerAndResolve("¿Quiénes la prepararon?");
    expect(getStepCounter()).toBe("Paso 3 de 4");

    await clickLabel("Luz Suárez");
    await goNext();
    expect(getHeading()).toBe("Revisá antes de guardar");
    expect(document.body.textContent).toContain(
      "3 de mayo de 2026 - 10:00 hs.",
    );

    await clickReactDomButton("Guardar");
    await waitFor(
      () => router.state.location.pathname === "/portal/coreografias",
    );

    const created = submissions.at(-1);
    expect(created?.get("intent")).toBe(CREATE_CHOREOGRAPHY_INTENT);
    expect(created?.get("name")).toBe("Danza de la Luna");
    expect(created?.get("submodalityId")).toBe("submodality_1");
    expect(created?.getAll("dancerIds")).toEqual(["dancer_1"]);
    expect(created?.getAll("professorIds")).toEqual(["professor_1"]);
    expect(created?.get("scheduleCapacityId")).toBe("capacity_1");
  });

  test("asks the level and the schedule on the category step, with a full schedule greyed out", async () => {
    const { router, submissions } = renderPage({
      resolve: resolved(
        buildResolution({
          experienceLevel: {
            required: true,
            options: [
              { id: "amateur", name: "Amateur" },
              { id: "elite", name: "Elite" },
            ],
          },
          schedule: {
            status: "multiple",
            canConfirm: true,
            options: [
              {
                ...buildScheduleOption("capacity_1", "2026-05-02"),
                isFull: true,
                label: "2 de mayo de 2026 - 10:00 hs.",
              },
              {
                ...buildScheduleOption("capacity_2", "2026-05-03"),
                isFull: false,
                label: "3 de mayo de 2026 - 10:00 hs.",
              },
            ],
          },
        }),
      ),
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await fillFirstStep();
    await pickDancerAndResolve("Categoría");

    expect(getStepCounter()).toBe("Paso 3 de 5");
    expect(document.body.textContent).toContain("Juvenil - Solo");
    expect(isNextDisabled()).toBe(true);

    await clickLabel("Elite");
    await clickLabel("2 de mayo de 2026 - 10:00 hs.");
    expect(isNextDisabled()).toBe(true);

    await clickLabel("3 de mayo de 2026 - 10:00 hs.");
    expect(isNextDisabled()).toBe(false);

    await goNext();
    await clickLabel("Luz Suárez");
    await goNext();
    await clickReactDomButton("Guardar");
    await waitFor(
      () => router.state.location.pathname === "/portal/coreografias",
    );

    expect(submissions.at(-1)?.get("experienceLevelId")).toBe("elite");
    expect(submissions.at(-1)?.get("scheduleCapacityId")).toBe("capacity_2");
  });

  test("keeps the academy on the dancers step with the refusal as a notice", async () => {
    const refusal =
      "No hay una categoría de Jazz para Solo con las edades de estos bailarines. Revisá los bailarines o la modalidad.";
    const { router } = renderPage({
      resolve: resolved(
        buildResolution({
          category: { status: "pending", reason: "no-compatible-category" },
        }),
      ),
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await fillFirstStep();
    await clickLabel("Ana Paz");
    await goNext();
    await waitFor(() => document.body.textContent?.includes(refusal) ?? false);

    expect(getHeading()).toBe("¿Quiénes bailan?");
  });

  test("goes back to a step from the summary's Cambiar and keeps the answers", async () => {
    const { router } = renderPage({ resolve: resolved(buildResolution()) });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await fillFirstStep();
    await pickDancerAndResolve("¿Quiénes la prepararon?");
    await clickLabel("Luz Suárez");
    await goNext();

    expect(findButton("Cambiar Categoría")).toBeUndefined();

    await clickReactDomButton("Cambiar Nombre");

    expect(getHeading()).toBe("La coreografía");
    expect(
      document.querySelector<HTMLInputElement>("input[name='name']")?.value,
    ).toBe("Danza de la Luna");
  });

  test("shows a save error on the summary without losing the answers", async () => {
    const { router } = renderPage({
      resolve: resolved(buildResolution()),
      create: {
        intent: CREATE_CHOREOGRAPHY_INTENT,
        result: {
          ok: false,
          code: "schedule-capacity-full",
          error:
            "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
        },
      },
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await fillFirstStep();
    await pickDancerAndResolve("¿Quiénes la prepararon?");
    await clickLabel("Luz Suárez");
    await goNext();
    await clickReactDomButton("Guardar");
    await waitFor(
      () =>
        document.body.textContent?.includes(
          "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
        ) ?? false,
    );

    expect(getHeading()).toBe("Revisá antes de guardar");
    expect(document.body.textContent).toContain("Danza de la Luna");
  });
});
