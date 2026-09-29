/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { ChoreographyDetailRouteView } from "@/features/admin/choreographies/detail/view";
import {
  getChoreographyDraftClassificationKey,
  getChoreographyDraftPreviewKey,
  type ChoreographyDraftPreview,
} from "@/features/admin/choreographies/detail/draft.shared";
import type { ChoreographyDetailLoaderData } from "@/features/admin/choreographies/detail/server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

type DetailViewProps = Parameters<typeof ChoreographyDetailRouteView>[0];

describe("ChoreographyDetailRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("announces the evaluation lock", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({ isEvaluated: true }),
      }),
    });

    expect(markup).toContain("Esta coreografía ya fue evaluada");
    expect(markup).toContain(
      "Esta coreografía ya fue evaluada y no puede modificarse.",
    );
  });

  // Holding a number is not a lock: the administrator keeps correcting the
  // choreography, and the alert only says where the correction may echo.
  test("announces the presentation number without locking anything", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({ presentationOrderNumber: 7 }),
      }),
    });

    expect(markup).toContain("Tiene la presentación n.º 7");
    expect(markup).toContain(
      "tiene número de presentación y modificarla puede necesitar atención",
    );
    expect(markup).not.toContain("Esta coreografía ya fue evaluada");
  });

  test("announces neither alert on a choreography that is neither numbered nor evaluated", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("Esta coreografía ya fue evaluada");
    expect(markup).not.toContain("Tiene la presentación n.º");
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

  // The withdrawal closes the page, not the role: the fields read like an
  // auditor's, and the one action left is offered all the same.
  test("renders every field read-only while the choreography is withdrawn", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        choreography: buildChoreography({ isWithdrawn: true }),
        restoration: { canRestore: true },
      }),
    });

    expect(markup).not.toContain("Guardar");
    expect(markup).not.toContain('name="name"');
    expect(markup).not.toContain('name="submodalityId"');
    expect(markup).not.toContain('name="scheduleCapacityId"');
    expect(markup).not.toContain('name="modalityId"');
    expect(markup).not.toContain("Eliminar coreografía");
  });

  test("reports the price blocker in the page alert instead of on the field", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        scheduleCapacity: {
          blockers: [
            {
              code: "no-price-preserving-option",
              label:
                "No se puede reasignar el cupo de cronograma: hay inscripciones con dinero asignado y no hay cronogramas alternativos que mantengan el precio.",
            },
          ],
        },
      }),
    });

    expect(markup).toContain(
      "No se puede reasignar el cupo de cronograma: hay inscripciones con dinero asignado",
    );
  });

  test("shows the price alert to auditors too", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        scheduleCapacity: {
          blockers: [
            { code: "price-filtered-options", label: "Hay dinero asignado." },
          ],
        },
      }),
    });

    expect(markup).toContain("Hay dinero asignado.");
  });

  test("does not announce a schedule capacity blocker when there is none", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("No se puede reasignar el cupo de cronograma");
  });

  test("announces the deposit as a blocker-in-waiting for the modality, auditors included", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        modality: {
          blockers: [
            {
              code: "price-change",
              label:
                "Solo se puede corregir la modalidad si el cronograma no cambia de precio: hay inscripciones con dinero asignado.",
            },
          ],
          options: [],
        },
      }),
    });

    expect(markup).toContain(
      "Solo se puede corregir la modalidad si el cronograma no cambia de precio",
    );
  });

  test("does not announce a modality blocker when there is no money on it", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain(
      "Solo se puede corregir la modalidad si el cronograma no cambia de precio",
    );
  });

  test("reads a category without levels as `No aplica`, not as a missing value", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          experienceLevelOptions: [],
          requiresExperienceLevel: false,
        }),
      }),
    });

    expect(markup).toContain("No aplica");
    expect(markup).not.toContain("Sin asignar");
  });

  test("reads a required level that is missing as `Sin asignar` when nobody can set it", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          isEvaluated: true,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel"],
          },
        }),
      }),
    });

    expect(markup).toContain("Sin asignar");
    expect(markup).not.toContain("No aplica");
  });

  test("announces the missing level in the page alert, without a CTA when the field is blocked", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          isEvaluated: true,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel"],
          },
        }),
      }),
    });

    expect(markup).toContain("Falta el nivel de experiencia");
    expect(markup).toContain("su categoría lo requiere");
    expect(markup).not.toContain("Elegí uno para completarla");
  });

  test("invites the admin to fix the missing level when the field is open", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel"],
          },
        }),
      }),
    });

    expect(markup).toContain("Falta el nivel de experiencia");
    expect(markup).toContain("Elegí uno para completarla");
  });

  test("announces a placement the category no longer admits", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["categoryAgeMismatch", "experienceLevelMismatch"],
          },
        }),
      }),
    });

    expect(markup).toContain("La categoría no coincide con las edades");
    expect(markup).toContain(
      "El nivel de experiencia no pertenece a la categoría",
    );
    expect(markup).toContain("ya no admite el nivel de experiencia guardado");
  });

  // The roster is where an age mismatch is normally repaired, but a presentation
  // blocks it — so the alert must not send the reader to a field that refuses the
  // edit. The wording does not depend on who is looking.
  test("names only the repair the age mismatch actually leaves open", () => {
    const misplaced = {
      code: "incomplete" as const,
      pendingItems: ["categoryAgeMismatch" as const],
    };

    const repairable = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({ operationalStatus: misplaced }),
      }),
    });
    const whenEvaluated = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          isEvaluated: true,
          operationalStatus: misplaced,
        }),
      }),
    });
    const forAuditor = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        choreography: buildChoreography({ operationalStatus: misplaced }),
      }),
    });

    expect(repairable).toContain(
      "Por favor, revisá la categoría y/o el elenco",
    );
    expect(whenEvaluated).not.toContain("y/o el elenco");
    expect(whenEvaluated).toContain(
      "La evaluación bloquea el elenco, así que la corrección es sobre la categoría. Por favor, revisala.",
    );
    expect(forAuditor).toContain("La categoría no coincide con las edades");
    expect(forAuditor).toContain(
      "Por favor, revisá la categoría y/o el elenco",
    );
  });

  test("keeps a well-placed choreography free of mismatch alerts", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({ choreography: buildChoreography() }),
    });

    expect(markup).not.toContain("La categoría no coincide con las edades");
    expect(markup).not.toContain(
      "El nivel de experiencia no pertenece a la categoría",
    );
  });

  // The same rule as #619's financial alert: it reports a state of the data, not
  // an action, so it is not suppressed for the auditor.
  test("shows the missing-level alert to auditors too", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel"],
          },
        }),
      }),
    });

    expect(markup).toContain("Falta el nivel de experiencia");
  });

  test("does not announce a missing level when the choreography has one", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("Falta el nivel de experiencia");
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

  // The dialog names the outcome before the admin confirms: the two are not
  // the same act, and only one of them keeps the money where it is.
  test("announces a withdrawal when the choreography holds money or comprobantes", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
      loaderData: buildLoaderData({
        deletion: { blockers: [], canDelete: true, outcome: "withdrawn" },
      }),
    });

    expect(document.body.textContent).toContain("Eliminar coreografía");
    expect(document.body.textContent).toContain("queda retirada");
    expect(document.body.textContent).toContain("No se mueve dinero");
  });

  test("announces an outright removal when there is nothing to preserve", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
      loaderData: buildLoaderData({
        deletion: { blockers: [], canDelete: true, outcome: "deleted" },
      }),
    });

    expect(document.body.textContent).toContain("Eliminar coreografía");
    expect(document.body.textContent).toContain("se elimina por completo");
    expect(document.body.textContent).not.toContain("queda retirada");
  });

  test("opens a blocked delete dialog with concrete blocker reasons", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
      loaderData: buildLoaderData({
        deletion: {
          canDelete: false,
          outcome: "deleted",
          blockers: [
            {
              code: "evaluated-presentation",
              label: "la presentación ya fue evaluada",
            },
          ],
        },
      }),
    });

    expect(document.body.textContent).toContain(
      "No se puede eliminar esta coreografía",
    );
    expect(document.body.textContent).toContain(
      "la presentación ya fue evaluada",
    );
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

  /**
   * The capacity select labels through the shared builder, occupancy included
   * and a full capacity disabled, so it cannot drift from the portal's.
   */
  test("labels the capacity select with the shared occupancy format", async () => {
    const loaderData = buildLoaderData();

    await renderDetailIntoDocument({
      loaderData: {
        ...loaderData,
        draft: {
          ...loaderData.draft,
          scheduleCapacity: {
            options: [
              {
                id: "schedule_capacity_1",
                isFull: false,
                label: "1 de mayo de 2026 - 14:00 hs. · 1/5 ocupados",
              },
              {
                id: "schedule_capacity_2",
                isFull: true,
                label:
                  "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
              },
            ],
            selectedId: "schedule_capacity_1",
          },
        },
      },
    });

    expect(readScheduleCapacityOptions()).toEqual([
      {
        disabled: false,
        label: "1 de mayo de 2026 - 14:00 hs. · 1/5 ocupados",
        value: "schedule_capacity_1",
      },
      {
        disabled: true,
        label: "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
        value: "schedule_capacity_2",
      },
    ]);
  });

  // The two actions are mutually exclusive: a withdrawn choreography is not
  // removed again, and the only thing it still accepts is coming back.
  test("offers restoring instead of removing while the choreography is withdrawn", async () => {
    await renderDetailIntoDocument({
      loaderData: buildLoaderData({
        choreography: buildChoreography({ isWithdrawn: true }),
        restoration: { canRestore: true },
      }),
    });

    await openActionsMenu();
    expect(document.body.textContent).toContain("Restaurar coreografía");
    expect(document.body.textContent).not.toContain("Eliminar coreografía");

    await clickMenuItem("Restaurar coreografía");

    expect(document.body.textContent).toContain(
      "Vuelve a la lista con las inscripciones que tenía al retirarse",
    );
    expect(document.body.textContent).toContain("siguen de baja");
  });

  async function renderDetailIntoDocument(
    input: Partial<DetailViewProps> & {
      initialDeleteDialogOpen?: boolean;
      initialRestoreDialogOpen?: boolean;
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
              initialRestoreDialogOpen={input.initialRestoreDialogOpen}
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
  const choreography = overrides.choreography ?? buildChoreography();

  return {
    availableDancers: [
      { active: true, firstName: "Ana", id: "dancer_1", lastName: "Paz" },
    ],
    availableProfessors: [
      { active: true, firstName: "Luz", id: "professor_1", lastName: "Suárez" },
    ],
    backToList: "/administracion/coreografias",
    canEdit: true,
    choreography,
    deletion: {
      canDelete: true,
      blockers: [],
      outcome: "deleted",
    },
    draft: buildSavedPreview(choreography),
    restoration: {
      canRestore: false,
    },
    modality: {
      blockers: [],
      options: [
        { hasCompatibleScheduleCapacity: true, id: "modality_1", name: "Jazz" },
        {
          hasCompatibleScheduleCapacity: true,
          id: "modality_2",
          name: "Urbano",
        },
        {
          hasCompatibleScheduleCapacity: false,
          id: "modality_3",
          name: "Folclore",
        },
      ],
    },
    scheduleCapacity: { blockers: [] },
    selectedEventId: "event_1",
    ...overrides,
  };
}

/** What the loader previews for the choreography as saved. */
function buildSavedPreview(
  choreography: ChoreographyDetailLoaderData["choreography"],
): ChoreographyDraftPreview {
  return {
    blockers: [],
    category: { id: choreography.categoryId, name: choreography.categoryName },
    consequences: {
      category: null,
      groupType: null,
      price: null,
      scheduleCapacity: null,
      withdrawnDancers: [],
    },
    experienceLevel: {
      options: choreography.experienceLevelOptions,
      required: choreography.requiresExperienceLevel,
    },
    classificationKey: getChoreographyDraftClassificationKey({
      dancerIds: choreography.dancers.map((dancer) => dancer.id),
      modalityId: choreography.modalityId,
    }),
    groupType: choreography.groupType,
    key: getChoreographyDraftPreviewKey({
      dancerIds: choreography.dancers.map((dancer) => dancer.id),
      modalityId: choreography.modalityId,
      scheduleCapacityId: choreography.scheduleCapacityId,
    }),
    scheduleCapacity: {
      options: [
        {
          id: choreography.scheduleCapacityId,
          isFull: false,
          label: choreography.scheduleLabel,
        },
      ],
      selectedId: choreography.scheduleCapacityId,
    },
    structuralLock: choreography.isEvaluated
      ? "Esta coreografía ya fue evaluada y no puede modificarse."
      : null,
    submodality: { options: [{ id: "submodality_1", name: "Lyrical" }] },
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
    isEvaluated: false,
    isWithdrawn: false,
    id: "choreo_1",
    presentationOrderNumber: null,
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
    requiresExperienceLevel: true,
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

/**
 * The select renders a hidden native `<select>` with one `<option>` per entry:
 * that is where the label and the `disabled` that actually reach the DOM live,
 * without depending on opening the popover.
 */
function readScheduleCapacityOptions() {
  const select = Array.from(document.querySelectorAll("select")).find(
    (candidate) =>
      Array.from(candidate.options).some(
        (option) => option.value === "schedule_capacity_1",
      ),
  );

  if (!select) {
    throw new Error("Expected the schedule capacity select to be rendered.");
  }

  return Array.from(select.options)
    .filter((option) => option.value.length > 0)
    .map((option) => ({
      disabled: option.disabled,
      label: option.textContent ?? "",
      value: option.value,
    }));
}
