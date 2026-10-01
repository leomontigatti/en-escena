/** @vitest-environment jsdom */

import { act } from "react";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useActionData,
  useLoaderData,
} from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, test } from "vitest";

import {
  getChoreographyDraftClassificationKey,
  getChoreographyDraftPreviewKey,
  readChoreographyDraftFormData,
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  type ChoreographyDraftPreview,
} from "@/features/admin/choreographies/detail/draft.shared";
import type { ChoreographyDetailLoaderData } from "@/features/admin/choreographies/detail/server";
import {
  shouldRevalidateChoreographyDetail,
  toChoreographyDetailViewActionData,
} from "@/features/admin/choreographies/detail/shared";
import { ChoreographyDetailRouteView } from "@/features/admin/choreographies/detail/view";
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

describe("the choreography detail as one draft", () => {
  test("holds a submodality and a level until `Guardar`, and saves them without a dialog", async () => {
    const page = await renderDetailPage();

    await pickOption("Submodalidad", "Contemporáneo");
    await pickOption("Nivel de experiencia", "Profesional");

    expect(page.submissions).toEqual([]);
    expect(isSaveEnabled()).toBe(true);

    await clickReactDomButton("Guardar");
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.saves()).toEqual([
      expect.objectContaining({
        experienceLevelId: "profesional",
        submodalityId: "submodality_2",
      }),
    ]);
  });

  test("saves a rename or a professors-only change straight through", async () => {
    const page = await renderDetailPage();

    await typeName("Danza solar");
    await toggleRow("Profesores", "Mora Díaz");
    await clickReactDomButton("Guardar");
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.saves()).toEqual([
      expect.objectContaining({
        name: "Danza solar",
        professorIds: ["professor_1", "professor_2"],
      }),
    ]);
  });

  test("previews a dancer change with the derived fields pending, and updates them in place", async () => {
    const held = createDeferred();
    const page = await renderDetailPage({
      preview: async () => {
        await held.promise;

        return duoPreview();
      },
    });

    await toggleRow("Bailarines", "Bea Lagos");

    expect(page.previews()).toHaveLength(1);
    expect(isPending("Categoría")).toBe(true);
    expect(isPending("Tipo de grupo")).toBe(true);
    expect(isSaveEnabled()).toBe(false);

    held.resolve();
    await settle();

    expect(isPending("Categoría")).toBe(false);
    expect(readField("Categoría")).toBe("Juvenil dúo");
    expect(readField("Tipo de grupo")).toBe("Dúo");
    expect(isSaveEnabled()).toBe(true);
  });

  test("confirms a save with consequences, naming the dancer it withdraws", async () => {
    const page = await renderDetailPage({
      preview: () =>
        duoPreview({
          dancerIds: ["dancer_2", "dancer_3"],
          withdrawnDancers: [{ id: "dancer_1", name: "Ana Paz" }],
        }),
    });

    await toggleRow("Bailarines", "Ana Paz");
    await toggleRow("Bailarines", "Bea Lagos");
    await toggleRow("Bailarines", "Cora Ruiz");
    await settle();
    await clickReactDomButton("Guardar");
    await settle();

    const dialog = findDialog();
    expect(dialog?.textContent).toContain("Ana Paz: inscripción retirada");
    expect(dialog?.textContent).toContain("Solo → Dúo");
    expect(page.saves()).toEqual([]);

    await clickReactDomButton("Confirmar y guardar");
    await settle();

    expect(page.saves()).toEqual([
      expect.objectContaining({ dancerIds: ["dancer_2", "dancer_3"] }),
    ]);
  });

  test("clears the submodality on a modality change, and holds `Guardar` until the required choices are made", async () => {
    await renderDetailPage({ preview: () => urbanoPreview() });

    await pickOption("Modalidad", "Urbano");
    await settle();

    expect(readTrigger("Submodalidad")).toBe("Elegí la submodalidad");
    expect(readTrigger("Nivel de experiencia")).toBe(
      "Elegí el nivel de experiencia",
    );
    expect(isSaveEnabled()).toBe(false);

    await pickOption("Submodalidad", "Hip hop");
    expect(isSaveEnabled()).toBe(false);

    await pickOption("Nivel de experiencia", "Amateur");
    expect(isSaveEnabled()).toBe(true);
  });

  test("shows why there is no category next to the field, and keeps `Guardar` off", async () => {
    await renderDetailPage({
      preview: () =>
        buildPreview({
          blockers: [
            {
              code: "category",
              message: "Con este elenco no existe una categoría válida.",
            },
          ],
          category: null,
          dancerIds: ["dancer_1", "dancer_2"],
          groupType: "duo",
        }),
    });

    await toggleRow("Bailarines", "Bea Lagos");
    await settle();

    expect(readFieldReason("Categoría")).toBe(
      "Con este elenco no existe una categoría válida.",
    );
    expect(isSaveEnabled()).toBe(false);
  });

  test("keeps every drafted value on screen when the save is refused", async () => {
    await renderDetailPage({
      save: () => ({
        message: "El cronograma seleccionado ya no tiene cupo disponible.",
        status: "error",
      }),
    });

    await typeName("Danza solar");
    await clickReactDomButton("Guardar");
    // The refusal shows when the save answers, not a fixed pause after the
    // click: under a loaded suite the pause used to end first (#1338).
    await waitFor(
      () =>
        document.body.textContent?.includes(
          "El cronograma seleccionado ya no tiene cupo disponible.",
        ) ?? false,
    );

    expect(getNameInput().value).toBe("Danza solar");
    expect(isSaveEnabled()).toBe(true);
  });

  test("leaves the name editable and the structure read-only once evaluated", async () => {
    await renderDetailPage({
      loaderData: buildLoaderData({
        draft: buildPreview({
          structuralLock:
            "Esta coreografía ya fue evaluada y no puede modificarse.",
        }),
        isEvaluated: true,
      }),
    });

    expect(getNameInput().disabled).toBe(false);
    expect(findTrigger("Modalidad")).toBeUndefined();
    expect(findTrigger("Submodalidad")).toBeUndefined();
    expect(isRowDisabled("Bailarines", "Bea Lagos")).toBe(true);
    expect(isRowDisabled("Profesores", "Mora Díaz")).toBe(true);
  });

  test("shows the auditor the whole detail read-only, with nothing to save", async () => {
    await renderDetailPage({
      loaderData: buildLoaderData({ canEdit: false }),
    });

    expect(document.querySelector('input[name="name"]')).toBeNull();
    expect(findTrigger("Modalidad")).toBeUndefined();
    expect(isRowDisabled("Bailarines", "Ana Paz")).toBe(true);
    expect(findButton("Guardar")).toBeUndefined();
  });
});

describe("leaving the choreography detail with unsaved changes", () => {
  test("offers `Descartar cambios` only with changes, and it restores every field", async () => {
    await renderDetailPage({ preview: () => duoPreview() });

    expect(findButton("Descartar cambios")).toBeUndefined();

    await typeName("Danza solar");
    await toggleRow("Bailarines", "Bea Lagos");
    await settle();
    expect(readField("Tipo de grupo")).toBe("Dúo");

    await clickReactDomButton("Descartar cambios");
    await settle();

    expect(getNameInput().value).toBe("Danza lunar");
    expect(isRowChecked("Bailarines", "Bea Lagos")).toBe(false);
    expect(readField("Tipo de grupo")).toBe("Solo");
    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(isSaveEnabled()).toBe(false);
  });

  test("asks before leaving with changes, and cancelling keeps the draft", async () => {
    const page = await renderDetailPage();

    await typeName("Danza solar");
    await clickLink("Volver");

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");

    await clickReactDomButton("Cancelar", {
      within: document.querySelector('[role="alertdialog"]'),
    });
    await settle();

    expect(page.pathname()).toBe("/administracion/coreografias/choreo_1");
    expect(getNameInput().value).toBe("Danza solar");

    await clickLink("Volver");
    await clickReactDomButton("Descartar", { exact: true });
    await settle();

    expect(page.pathname()).toBe("/administracion/coreografias");
  });

  test("leaves without asking once the change is saved", async () => {
    const page = await renderDetailPage({
      save: (draft) => {
        page.setSaved({ name: draft.name });

        return { message: "Coreografía guardada.", status: "success" };
      },
    });

    await typeName("Danza solar");
    await clickReactDomButton("Guardar");
    await settle();
    await clickLink("Volver");

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/administracion/coreografias");
  });
});

type Draft = ReturnType<typeof readChoreographyDraftFormData>["draft"];

async function renderDetailPage(
  input: {
    loaderData?: ChoreographyDetailLoaderData;
    preview?: (
      draft: Draft,
    ) => ChoreographyDraftPreview | Promise<ChoreographyDraftPreview>;
    save?: (draft: Draft) => unknown;
  } = {},
) {
  let loaderData = input.loaderData ?? buildLoaderData();
  const submissions: Array<{ draft: Draft; intent: string }> = [];

  function Page() {
    const data = useLoaderData() as ChoreographyDetailLoaderData;
    const actionData = useActionData();

    return (
      <>
        <Toaster />
        <ChoreographyDetailRouteView
          actionData={toChoreographyDetailViewActionData(actionData)}
          loaderData={data}
        />
      </>
    );
  }

  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Link to="/administracion/coreografias">Coreografías</Link>
          </>
        ),
        path: "/administracion/coreografias",
      },
      {
        action: async ({ request }) => {
          const formData = await request.formData();
          const intent = String(formData.get("intent"));
          const { draft } = readChoreographyDraftFormData(formData);
          submissions.push({ draft, intent });

          if (intent === resolveChoreographyDraftIntent) {
            return {
              intent,
              preview: await (input.preview ?? (() => buildPreview()))(draft),
            };
          }

          return (
            input.save?.(draft) ?? {
              message: "Coreografía guardada.",
              status: "success",
            }
          );
        },
        element: <Page />,
        id: "detail",
        loader: () => loaderData,
        path: "/administracion/coreografias/choreo_1",
        shouldRevalidate: (arg) =>
          shouldRevalidateChoreographyDetail({
            actionResult: arg.actionResult,
            defaultShouldRevalidate: arg.defaultShouldRevalidate,
            formData: arg.formData,
          }),
      },
    ],
    {
      hydrationData: { loaderData: { detail: loaderData } },
      initialEntries: ["/administracion/coreografias/choreo_1"],
    },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return {
    pathname: () => router.state.location.pathname,
    previews: () =>
      submissions
        .filter(
          (submission) => submission.intent === resolveChoreographyDraftIntent,
        )
        .map((submission) => submission.draft),
    saves: () =>
      submissions
        .filter(
          (submission) => submission.intent === saveChoreographyDraftIntent,
        )
        .map((submission) => submission.draft),
    /** What the loader answers after a successful save. */
    setSaved(
      choreography: Partial<ChoreographyDetailLoaderData["choreography"]>,
    ) {
      loaderData = {
        ...loaderData,
        choreography: { ...loaderData.choreography, ...choreography },
      };
    },
    submissions,
  };
}

function buildPreview(
  input: Partial<ChoreographyDraftPreview> & {
    capacityId?: string;
    dancerIds?: string[];
    modalityId?: string;
    withdrawnDancers?: Array<{ id: string; name: string }>;
  } = {},
): ChoreographyDraftPreview {
  const {
    capacityId = "schedule_capacity_1",
    dancerIds = ["dancer_1"],
    modalityId = "modality_1",
    withdrawnDancers = [],
    ...preview
  } = input;

  return {
    blockers: [],
    category: { id: "category_1", name: "Juvenil" },
    consequences: {
      category: null,
      groupType: null,
      price: null,
      scheduleCapacity: null,
      withdrawnDancers,
    },
    experienceLevel: {
      options: [
        { id: "amateur", name: "Amateur" },
        { id: "profesional", name: "Profesional" },
      ],
      required: true,
    },
    classificationKey: getChoreographyDraftClassificationKey({
      dancerIds,
      modalityId,
    }),
    groupType: "solo",
    key: getChoreographyDraftPreviewKey({
      dancerIds,
      modalityId,
      scheduleCapacityId: capacityId,
    }),
    scheduleCapacity: {
      options: [
        {
          id: capacityId,
          isFull: false,
          label: "1 de mayo de 2026 - 14:00 hs.",
        },
      ],
      selectedId: capacityId,
    },
    structuralLock: null,
    submodality: {
      options: [
        { id: "submodality_2", name: "Contemporáneo" },
        { id: "submodality_1", name: "Lyrical" },
      ],
    },
    ...preview,
  };
}

function duoPreview(
  input: {
    dancerIds?: string[];
    withdrawnDancers?: Array<{ id: string; name: string }>;
  } = {},
) {
  const preview = buildPreview({
    capacityId: "schedule_capacity_duo",
    category: { id: "category_2", name: "Juvenil dúo" },
    dancerIds: input.dancerIds ?? ["dancer_1", "dancer_2"],
    experienceLevel: { options: [], required: false },
    groupType: "duo",
    withdrawnDancers: input.withdrawnDancers,
  });

  return {
    ...preview,
    consequences: {
      ...preview.consequences,
      category: { from: "Juvenil", to: "Juvenil dúo" },
      groupType: { from: "solo" as const, to: "duo" as const },
    },
  };
}

function urbanoPreview() {
  return buildPreview({
    capacityId: "schedule_capacity_9",
    category: { id: "category_9", name: "Juvenil urbano" },
    experienceLevel: {
      options: [{ id: "amateur", name: "Amateur" }],
      required: true,
    },
    modalityId: "modality_2",
    submodality: { options: [{ id: "submodality_9", name: "Hip hop" }] },
  });
}

function buildLoaderData(
  input: {
    canEdit?: boolean;
    draft?: ChoreographyDraftPreview;
    isEvaluated?: boolean;
  } = {},
): ChoreographyDetailLoaderData {
  return {
    availableDancers: [
      { active: true, firstName: "Ana", id: "dancer_1", lastName: "Paz" },
      { active: true, firstName: "Bea", id: "dancer_2", lastName: "Lagos" },
      { active: true, firstName: "Cora", id: "dancer_3", lastName: "Ruiz" },
    ],
    availableProfessors: [
      { active: true, firstName: "Luz", id: "professor_1", lastName: "Suárez" },
      { active: true, firstName: "Mora", id: "professor_2", lastName: "Díaz" },
    ],
    backToList: "/administracion/coreografias",
    canEdit: input.canEdit ?? true,
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
          hasEvidence: true,
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
      id: "choreo_1",
      isEvaluated: input.isEvaluated ?? false,
      isWithdrawn: false,
      modalityId: "modality_1",
      modalityName: "Jazz",
      musicDownloadUrl: null,
      musicStorageKey: null,
      name: "Danza lunar",
      operationalStatus: { code: "complete", pendingItems: [] },
      presentationOrderNumber: null,
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
    deletion: { blockers: [], canDelete: true, outcome: "deleted" },
    draft: input.draft ?? buildPreview(),
    modality: {
      blockers: [],
      options: [
        { hasCompatibleScheduleCapacity: true, id: "modality_1", name: "Jazz" },
        {
          hasCompatibleScheduleCapacity: true,
          id: "modality_2",
          name: "Urbano",
        },
      ],
    },
    restoration: { canRestore: false },
    scheduleCapacity: { blockers: [] },
    selectedEventId: "event_1",
  };
}

function createDeferred() {
  let resolve = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = () => resolvePromise();
  });

  return { promise, resolve: () => resolve() };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function findField(label: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="field"]'),
  ).find(
    (field) =>
      field.querySelector('[data-slot="field-label"]')?.textContent?.trim() ===
      label,
  );
}

function findTrigger(label: string) {
  return (
    findField(label)?.querySelector<HTMLElement>(
      '[data-slot="select-trigger"]',
    ) ?? undefined
  );
}

function readTrigger(label: string) {
  return findTrigger(label)?.textContent?.trim();
}

/** A read-only field is a disabled input: what is read is its value. */
function readField(label: string) {
  return (
    findField(label)?.querySelector<HTMLInputElement>(
      'input:not([type="hidden"])',
    )?.value ?? null
  );
}

function isPending(label: string) {
  return (
    findField(label)?.closest("[aria-busy]")?.getAttribute("aria-busy") ===
    "true"
  );
}

/** The reason a preview gives for a field, shown right under it. */
function readFieldReason(label: string) {
  return findField(label)
    ?.parentElement?.querySelector('[data-slot="field-error"]')
    ?.textContent?.trim();
}

async function pickOption(label: string, option: string) {
  await openRadixSelect(findTrigger(label));
  await selectRadixOption(option);
  await settle();
}

function findRow(group: string, name: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[role="group"][aria-label="${group}"] [data-slot="checklist-row"]`,
    ),
  ).find((row) => row.textContent === name);
}

async function toggleRow(group: string, name: string) {
  const row = findRow(group, name);

  if (!row) {
    throw new Error(`Expected "${name}" in the ${group} checklist.`);
  }

  await updateReactDomForm(() => {
    row.querySelector("label")?.click();
  });
  await settle();
}

function isRowDisabled(group: string, name: string) {
  return (
    findRow(group, name)?.querySelector("button")?.hasAttribute("disabled") ??
    false
  );
}

function isRowChecked(group: string, name: string) {
  return (
    findRow(group, name)
      ?.querySelector("button")
      ?.getAttribute("aria-checked") === "true"
  );
}

function getNameInput() {
  const input = document.querySelector<HTMLInputElement>('input[name="name"]');

  if (!input) {
    throw new Error("Expected the `Nombre` input to be rendered.");
  }

  return input;
}

async function typeName(value: string) {
  await updateReactDomForm(() => {
    setInputValue(getNameInput(), value);
  });
  await settle();
}

function isSaveEnabled() {
  const button = findButton("Guardar", { exact: true });

  return button !== undefined && !(button as HTMLButtonElement).disabled;
}

function findDialog() {
  return (
    document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined
  );
}

async function clickLink(text: string) {
  const link = Array.from(document.querySelectorAll("a")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  if (!link) {
    throw new Error(`Expected a "${text}" link.`);
  }

  await act(async () => {
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }),
    );
    await Promise.resolve();
  });
  await settle();
}
