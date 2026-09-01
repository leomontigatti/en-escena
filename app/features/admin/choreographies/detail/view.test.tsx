/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { ChoreographyDetailRouteView } from "@/features/admin/choreographies/detail/view";
import type {
  ChoreographyDetailLoaderData,
  ChoreographyRosterResolutionData,
} from "@/features/admin/choreographies/detail/server";
import { resolveChoreographyRosterIntent } from "@/features/admin/choreographies/detail/shared";
import type { ChoreographyDancerScheduleChoice } from "@/lib/choreographies/choreography-roster.shared";
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
    expect(markup).toContain("no la modalidad, los bailarines, los profesores");
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

  test("reports the frozen-price blocker in the page alert instead of on the field", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        scheduleCapacity: {
          blockers: [
            {
              code: "frozen-price",
              label:
                "Al menos una inscripción tiene dinero asignado: su precio quedó congelado contra este cronograma.",
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
    expect(markup).toContain("Al menos una inscripción tiene dinero asignado");
    expect(markup).not.toContain('name="assignedScheduleCapacityId"');
  });

  test("shows the frozen-price alert to auditors too", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        scheduleCapacity: {
          blockers: [{ code: "frozen-price", label: "Hay dinero asignado." }],
          canReassign: false,
          options: [],
        },
      }),
    });

    expect(markup).toContain("El cupo de cronograma está bloqueado");
    expect(markup).toContain("Hay dinero asignado.");
  });

  test("does not announce a cupo de cronograma blocker when there is none", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("El cupo de cronograma está bloqueado");
  });

  test("renders an editable modalidad select for admins", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).toContain("Modalidad");
    expect(markup).toContain('name="modalityId"');
    expect(markup).toContain('value="modality_1"');
  });

  // Which condition closed the field is decided by
  // `canCorrectChoreographyModality` and covered in `shared.test.ts`; the view
  // only ever reads the resolved `canCorrect`, so one case covers it here.
  test("keeps the modalidad read-only when the correction is closed", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: true,
        modality: {
          blockers: [],
          canCorrect: false,
          options: [],
        },
      }),
    });

    expect(markup).toContain("Modalidad");
    expect(markup).toContain("Jazz");
    expect(markup).not.toContain('name="modalityId"');
  });

  test("announces the seña as a blocker-in-waiting for the modalidad, auditors included", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        canEdit: false,
        modality: {
          blockers: [
            {
              code: "frozen-price",
              label:
                "Al menos una inscripción tiene dinero asignado: solo se puede corregir la modalidad si el cronograma no se mueve.",
            },
          ],
          canCorrect: false,
          options: [],
        },
      }),
    });

    expect(markup).toContain("La modalidad tiene un bloqueo en potencia");
    expect(markup).toContain(
      "solo se puede corregir la modalidad si el cronograma no se mueve",
    );
  });

  test("does not announce a modalidad blocker when there is no money on it", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("La modalidad tiene un bloqueo en potencia");
  });

  test("renders a standalone nivel de experiencia select for admins whose category declares levels", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).toContain("Nivel de experiencia");
    expect(markup).toContain('name="assignedExperienceLevelId"');
    // El select del roster no coexiste con el autónomo: comparten el slot.
    expect(markup).not.toContain('name="experienceLevelId"');
  });

  test.each([
    ["the user is not an admin", { canEdit: false }],
    [
      "the choreography has a presentation",
      { choreography: buildChoreography({ hasPresentation: true }) },
    ],
    [
      "the resolved category declares no levels",
      {
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          experienceLevelOptions: [],
          requiresExperienceLevel: false,
        }),
      },
    ],
  ])(
    "keeps the nivel de experiencia read-only when %s",
    (_cause, overrides: Partial<ChoreographyDetailLoaderData>) => {
      const markup = renderDetail({
        loaderData: buildLoaderData({
          experienceLevel: { canReassign: false },
          ...overrides,
        }),
      });

      expect(markup).toContain("Nivel de experiencia");
      expect(markup).not.toContain('name="assignedExperienceLevelId"');
    },
  );

  test("reads a category without levels as No aplica, not as a missing value", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          experienceLevelOptions: [],
          requiresExperienceLevel: false,
        }),
        experienceLevel: { canReassign: false },
      }),
    });

    expect(markup).toContain("No aplica");
    expect(markup).not.toContain("Sin asignar");
  });

  test("reads a required level that is missing as Sin asignar when nobody can set it", () => {
    const markup = renderDetail({
      loaderData: buildLoaderData({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
          hasPresentation: true,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel"],
          },
        }),
        experienceLevel: { canReassign: false },
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
          hasPresentation: true,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel"],
          },
        }),
        experienceLevel: { canReassign: false },
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

  // Misma regla que la alerta financiera de #619: informa un estado de los
  // datos, no una acción, así que no se suprime para el auditor.
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
        experienceLevel: { canReassign: false },
      }),
    });

    expect(markup).toContain("Falta el nivel de experiencia");
  });

  test("does not announce a missing level when the choreography has one", () => {
    const markup = renderDetail({ loaderData: buildLoaderData() });

    expect(markup).not.toContain("Falta el nivel de experiencia");
  });

  test("reports the rejection of a nivel de experiencia to the view", () => {
    const markup = renderDetail({
      actionData: {
        message:
          "No se puede cambiar el nivel de experiencia: la coreografía ya tiene presentación.",
        status: "error",
      },
      loaderData: buildLoaderData(),
    });

    expect(markup).toContain("Nivel de experiencia");
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

  /**
   * The roster select replaces the standalone reassignment while a dancer change
   * is pending, and only appears once the server resolves that change. The test
   * reaches it through the UI to pin that it labels through the shared builder —
   * occupancy included, full cupo disabled — instead of rebuilding the label on
   * its own, which is what made it diverge from the portal and from the
   * standalone reassignment.
   */
  test("labels the roster schedule select with the shared occupancy format", async () => {
    await renderDetailIntoDocument({
      loaderData: buildLoaderData({
        availableDancers: [
          { active: true, firstName: "Ana", id: "dancer_1", lastName: "Paz" },
          { active: true, firstName: "Eva", id: "dancer_2", lastName: "Ruiz" },
        ],
      }),
      rosterResolution: buildRosterResolution(),
    });

    await addDancerToRoster("Eva Ruiz");

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

  async function renderDetailIntoDocument(
    input: Partial<DetailViewProps> & {
      initialDeleteDialogOpen?: boolean;
      rosterResolution?: ChoreographyRosterResolutionData;
    } = {},
  ) {
    const loaderData = input.loaderData ?? buildLoaderData();
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/coreografias/choreo_1",
          action: async () => input.rosterResolution ?? null,
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
    experienceLevel: {
      canReassign: true,
    },
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
        {
          hasCompatibleScheduleCapacity: false,
          id: "modality_3",
          name: "Folclore",
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

function buildRosterResolution(): ChoreographyRosterResolutionData {
  return {
    intent: resolveChoreographyRosterIntent,
    result: {
      ok: true,
      resolution: {
        groupType: "duo",
        categoryId: "category_1",
        categoryName: "Juvenil",
        experienceLevel: { required: false, options: [] },
        schedule: {
          status: "multiple",
          canSave: true,
          selectedScheduleCapacityId: null,
          options: [
            buildRosterScheduleChoice({
              id: "schedule_capacity_1",
              isFull: false,
              label: "1 de mayo de 2026 - 14:00 hs. · 1/5 ocupados",
              scheduleId: "schedule_1",
              scheduledDate: "2026-05-01",
              startTime: "14:00:00",
            }),
            buildRosterScheduleChoice({
              id: "schedule_capacity_2",
              isFull: true,
              label: "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
              scheduleId: "schedule_2",
              scheduledDate: "2026-05-02",
              startTime: "10:00:00",
            }),
          ],
        },
      },
    },
  };
}

/**
 * `label` carries the occupancy suffix the shared builder composes, so it never
 * matches what re-formatting `schedule` would produce. The two still describe
 * the same slot: a fixture that disagreed with itself would read as a slip.
 */
function buildRosterScheduleChoice(input: {
  id: string;
  isFull: boolean;
  label: string;
  scheduleId: string;
  scheduledDate: string;
  startTime: string;
}): ChoreographyDancerScheduleChoice {
  return {
    id: input.id,
    isFull: input.isFull,
    label: input.label,
    scheduleId: input.scheduleId,
    scheduleCapacityId: input.id,
    groupType: "duo",
    capacity: 5,
    usesGlobalCapacity: false,
    schedule: {
      id: input.scheduleId,
      name: "Jornada 1",
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
    },
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
 * Adds a dancer through the combobox and waits for the server resolution to come
 * back: the roster schedule select does not exist until then.
 */
async function addDancerToRoster(label: string) {
  const trigger = Array.from(
    document.querySelectorAll('button[role="combobox"]'),
  ).find((candidate) => candidate.getAttribute("aria-haspopup") === "dialog");

  if (!trigger) {
    throw new Error("Expected the dancers combobox trigger to be rendered.");
  }

  await dispatchClick(trigger);

  const option = Array.from(document.querySelectorAll('[role="option"]')).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!option) {
    throw new Error(`Expected dancer option "${label}" to be rendered.`);
  }

  await dispatchClick(option);
  await waitForScheduleCapacitySelect();
}

async function dispatchClick(element: Element) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function waitForScheduleCapacitySelect() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (findScheduleCapacitySelect()) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  throw new Error(
    "Expected the roster schedule select to render after the resolution.",
  );
}

/**
 * The select renders a hidden native `<select>` with one `<option>` per entry:
 * that is where the label and the `disabled` that actually reach the DOM live,
 * without depending on opening the popover.
 */
function findScheduleCapacitySelect() {
  return Array.from(document.querySelectorAll("select")).find((candidate) =>
    Array.from(candidate.options).some(
      (option) => option.value === "schedule_capacity_1",
    ),
  );
}

function readScheduleCapacityOptions() {
  const select = findScheduleCapacitySelect();

  if (!select) {
    throw new Error("Expected the roster schedule select to be rendered.");
  }

  return Array.from(select.options)
    .filter((option) => option.value.length > 0)
    .map((option) => ({
      disabled: option.disabled,
      label: option.textContent ?? "",
      value: option.value,
    }));
}
