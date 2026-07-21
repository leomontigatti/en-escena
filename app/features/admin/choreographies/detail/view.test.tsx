/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { AdministracionCoreografiaDetalleRouteView } from "@/features/admin/choreographies/detail/view";
import type { AdministrativeChoreographyDetailLoaderData } from "@/features/admin/choreographies/detail/server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

type DetailViewProps = Parameters<
  typeof AdministracionCoreografiaDetalleRouteView
>[0];

describe("AdministracionCoreografiaDetalleRouteView", () => {
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
    expect(markup).toContain("1 de mayo de 2026 - 14:00 hs.");
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

    expect(markup).toContain("El roster está bloqueado");
    expect(markup).toContain("Esta coreografía ya tiene una presentación");
    expect(markup).toContain('aria-disabled="true"');
  });

  test("does not announce the roster hard lock when there is no presentation", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("El roster está bloqueado");
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
            <AdministracionCoreografiaDetalleRouteView
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
          <AdministracionCoreografiaDetalleRouteView
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
  overrides: Partial<AdministrativeChoreographyDetailLoaderData> = {},
): AdministrativeChoreographyDetailLoaderData {
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
    selectedEventId: "event_1",
    submodalityOptions: [{ id: "submodality_1", name: "Lyrical" }],
    ...overrides,
  };
}

function buildChoreography(
  overrides: Partial<
    AdministrativeChoreographyDetailLoaderData["choreography"]
  > = {},
): AdministrativeChoreographyDetailLoaderData["choreography"] {
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
