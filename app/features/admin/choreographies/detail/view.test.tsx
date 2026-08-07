/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { ChoreographyDetailRouteView } from "@/features/admin/choreographies/detail/view";
import type { ChoreographyDetailLoaderData } from "@/features/admin/choreographies/detail/server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

type DetailViewProps = Parameters<typeof ChoreographyDetailRouteView>[0];

describe("ChoreographyDetailRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("renders an editable roster and a read-only music field for admins", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: true,
        choreography: buildChoreography({
          musicDownloadUrl: "https://storage.example/music.mp3",
          musicStorageKey: "academies/a1/choreographies/c1/music.mp3",
        }),
      }),
    });

    expect(markup).toContain("Detalle coreografía");
    expect(markup).not.toContain("Datos de la coreografía");
    expect(markup).toContain("Academia Norte");
    expect(markup).toContain("Nombre");
    expect(markup).toContain('name="name"');
    expect(markup).toContain('value="Danza lunar"');
    expect(markup).not.toContain(
      'name="name" value="Danza lunar" type="hidden"',
    );
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Ana Paz");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Luz Suárez");
    expect(markup).toContain("Archivo de música");
    expect(markup).toContain("Cronograma");
    expect(markup).toContain("https://storage.example/music.mp3");
    expect(markup).toContain("Descargar música");
    expect(markup).toContain("Guardar");
    expect(markup).not.toContain("Guardar cambios");
    expect(markup).not.toContain(
      "La administración no edita bailarines desde esta vista.",
    );
    expect(markup).not.toContain(
      "La administración no edita profesores desde esta vista.",
    );
    expect(markup).not.toContain(
      "La música se gestiona desde el Portal de academias mientras no haya presentación.",
    );
  });

  test("leaves the roster comboboxes interactive for admins", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain('aria-disabled="true"');
  });

  test("hard-locks the roster when the choreography already has a presentation", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({ hasPresentation: true }),
      }),
    });

    expect(markup).toContain("La presentación bloquea esta coreografía");
    expect(markup).toContain("Esta coreografía ya tiene una presentación");
    expect(markup).toContain("los bailarines, los profesores, la submodalidad");
    expect(markup).toContain("cupo de cronograma");
    expect(markup).toContain('aria-disabled="true"');
  });

  test("does not announce the presentation hard lock when there is no presentation", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("La presentación bloquea esta coreografía");
  });

  test("renders name and actions as read-only for auditors", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
      }),
    });

    expect(markup).toContain("Detalle coreografía");
    expect(markup).toContain('value="Danza lunar"');
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Guardar");
    expect(markup).not.toContain("Eliminar coreografía");
  });

  test("renders an editable submodality select for admins", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).toContain("Submodalidad");
    expect(markup).toContain('name="submodalityId"');
  });

  test("keeps the submodality read-only when the choreography has a presentation", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({ hasPresentation: true }),
      }),
    });

    expect(markup).toContain("Submodalidad");
    expect(markup).not.toContain('name="submodalityId"');
  });

  test("keeps the submodality read-only when the modality has no submodalities", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({ submodalityOptions: [] }),
    });

    expect(markup).toContain("Submodalidad");
    expect(markup).not.toContain('name="submodalityId"');
  });

  test("keeps the submodality read-only for auditors", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({ canEdit: false }),
    });

    expect(markup).toContain("Submodalidad");
    expect(markup).not.toContain('name="submodalityId"');
  });

  test("renders a standalone cronograma select for admins with more than one compatible cupo", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).toContain("Cronograma");
    expect(markup).toContain('name="assignedScheduleCapacityId"');
    expect(markup).toContain('value="schedule_capacity_1"');
    expect(markup).not.toContain('name="scheduleCapacityId"');
  });

  test("keeps the cronograma read-only when it cannot be reassigned", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        scheduleCapacity: {
          blockers: [],
          canReassign: false,
          options: [
            {
              id: "schedule_capacity_1",
              isFull: false,
              label: "1 de mayo de 2026 - 14:00 hs.",
            },
          ],
        },
      }),
    });

    expect(markup).toContain("Cronograma");
    expect(markup).toContain("1 de mayo de 2026 - 14:00 hs.");
    expect(markup).not.toContain('name="assignedScheduleCapacityId"');
  });

  test("reports the frozen-deposit blocker in the page alert instead of on the field", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        scheduleCapacity: {
          blockers: [
            {
              code: "frozen-deposit",
              label:
                "Al menos una inscripción tiene seña registrada: su precio quedó congelado contra este cronograma.",
            },
          ],
          canReassign: false,
          options: [
            {
              id: "schedule_capacity_1",
              isFull: false,
              label: "1 de mayo de 2026 - 14:00 hs.",
            },
          ],
        },
      }),
    });

    expect(markup).toContain("El cupo de cronograma está bloqueado");
    expect(markup).toContain("Al menos una inscripción tiene seña registrada");
    expect(markup).not.toContain('name="assignedScheduleCapacityId"');
  });

  test("shows the frozen-deposit alert to auditors too", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        scheduleCapacity: {
          blockers: [{ code: "frozen-deposit", label: "Hay seña registrada." }],
          canReassign: false,
          options: [],
        },
      }),
    });

    expect(markup).toContain("El cupo de cronograma está bloqueado");
    expect(markup).toContain("Hay seña registrada.");
  });

  test("does not announce a cupo de cronograma blocker when there is none", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("El cupo de cronograma está bloqueado");
  });

  test("opens the delete dialog from the resource actions menu", async () => {
    await renderDetailIntoDocument();

    await openActionsMenu();
    expect(document.body.textContent).toContain("Eliminar coreografía");

    await clickMenuItem("Eliminar coreografía");

    expect(document.body.textContent).toContain("Eliminar coreografía");
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Eliminar",
      ),
    ).toBe(true);
  });

  test("opens a blocked delete dialog with concrete blocker reasons", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
      loaderData: buildLoaderData({
        deletion: {
          canDelete: false,
          blockers: [
            { code: "presentation", label: "presentación" },
            { code: "scores", label: "puntajes" },
          ],
        },
      }),
    });

    expect(document.body.textContent).toContain(
      "No se puede eliminar esta coreografía",
    );
    expect(document.body.textContent).toContain("presentación");
    expect(document.body.textContent).toContain("puntajes");
    expect(document.body.textContent).toContain("Cerrar");
    expect(document.body.textContent).not.toContain(
      "Esta acción es irreversible.",
    );
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Eliminar",
      ),
    ).toBe(false);
  });

  async function renderDetailIntoDocument(
    input: Partial<DetailViewProps> & {
      initialDeleteDialogOpen?: boolean;
    } = {},
  ) {
    const loaderData = input.loaderData ?? buildLoaderData();
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/coreografias/choreo_1",
          action: async () => null,
          element: (
            <ChoreographyDetailRouteView
              actionData={input.actionData}
              initialDeleteDialogOpen={input.initialDeleteDialogOpen}
              loaderData={loaderData}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/coreografias/choreo_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function renderDetail(
  input: Partial<DetailViewProps> & {
    initialDeleteDialogOpen?: boolean;
  } = {},
) {
  const loaderData = input.loaderData ?? buildLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/coreografias/choreo_1",
        action: async () => null,
        element: (
          <ChoreographyDetailRouteView
            actionData={input.actionData}
            initialDeleteDialogOpen={input.initialDeleteDialogOpen}
            loaderData={loaderData}
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/coreografias/choreo_1"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function buildLoaderData(
  overrides: Partial<ChoreographyDetailLoaderData> = {},
): ChoreographyDetailLoaderData {
  return {
    availableDancers: [
      { active: true, firstName: "Ana", id: "dancer_1", lastName: "Paz" },
    ],
    availableProfessors: [
      { active: true, firstName: "Luz", id: "professor_1", lastName: "Suárez" },
    ],
    backToList: "/administracion/coreografias",
    canEdit: true,
    choreography: buildChoreography(),
    deletion: {
      canDelete: true,
      blockers: [],
    },
    scheduleCapacity: {
      blockers: [],
      canReassign: true,
      options: [
        {
          id: "schedule_capacity_1",
          isFull: false,
          label: "1 de mayo de 2026 - 14:00 hs. · 1/5 ocupados",
        },
        {
          id: "schedule_capacity_2",
          isFull: false,
          label: "2 de mayo de 2026 - 10:00 hs. · 0/5 ocupados",
        },
      ],
    },
    selectedEventId: "event_1",
    submodalityOptions: [{ id: "submodality_1", name: "Lyrical" }],
    ...overrides,
  };
}

function buildChoreography(
  overrides: Partial<ChoreographyDetailLoaderData["choreography"]> = {},
): ChoreographyDetailLoaderData["choreography"] {
  return {
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
    groupType: "solo",
    hasPresentation: false,
    id: "choreo_1",
    modalityId: "modality_1",
    modalityName: "Jazz",
    musicDownloadUrl: null,
    musicStorageKey: null,
    name: "Danza lunar",
    operationalStatus: {
      code: "complete",
      pendingItems: [],
    },
    professors: [
      {
        active: true,
        firstName: "Luz",
        id: "professor_1",
        lastName: "Suárez",
      },
    ],
    scheduleCapacityId: "schedule_capacity_1",
    scheduleId: "schedule_1",
    scheduleLabel: "1 de mayo de 2026 - 14:00 hs.",
    submodalityId: "submodality_1",
    submodalityName: "Lyrical",
    ...overrides,
  };
}

async function openActionsMenu() {
  const button = document.querySelector('button[aria-label="Acciones"]');

  if (!button) {
    throw new Error("Expected choreography actions button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    ctrlKey: false,
  });
  Object.defineProperty(pointerDown, "pointerType", {
    value: "mouse",
  });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

async function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!item) {
    throw new Error(`Expected menu item "${label}" to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}
