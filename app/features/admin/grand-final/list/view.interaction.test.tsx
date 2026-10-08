/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { GrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import { discardChangesTitle } from "@/lib/shared/discard-guard";
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import {
  createReactDomTestRenderer,
  findButton,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type {
  FinalistPickChangeBlockReason,
  GrandFinalListActionData,
} from "./shared";
import { GrandFinalListView } from "./view";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

/**
 * Three judges, two modalities: Ana and Bruno agree on Vecina in Jazz, Carla
 * has no pick there, and only Carla picked in Tap. Pirueta is a finalist
 * through Tap, so it is marked in Jazz too, where nobody picked it. Pirueta
 * has both banners, Vecina one.
 */
const picks: GrandFinalPicks = {
  judges: [
    { id: "ana", name: "Ana Juez" },
    { id: "bruno", name: "Bruno Juez" },
    { id: "carla", name: "Carla Juez" },
  ],
  modalities: [
    {
      modalityId: "jazz",
      modalityName: "Danza Jazz",
      academies: [
        {
          academyId: "pirueta",
          bannerCount: 2,
          eligible: true,
          finalist: true,
          name: "Academia Pirueta",
          pickedByJudgeIds: [],
        },
        {
          academyId: "vecina",
          bannerCount: 1,
          eligible: true,
          finalist: true,
          name: "Academia Vecina",
          pickedByJudgeIds: ["ana", "bruno"],
        },
      ],
    },
    {
      modalityId: "tap",
      modalityName: "Tap",
      academies: [
        {
          academyId: "pirueta",
          bannerCount: 2,
          eligible: true,
          finalist: true,
          name: "Academia Pirueta",
          pickedByJudgeIds: ["carla"],
        },
        {
          academyId: "zapateo",
          bannerCount: 0,
          eligible: true,
          finalist: false,
          name: "Academia Zapateo",
          pickedByJudgeIds: [],
        },
      ],
    },
  ],
};

describe("administration's `Gran final` list", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    submitted.length = 0;
  });

  afterEach(renderer.cleanup);

  async function mount(
    loaderPicks: GrandFinalPicks = picks,
    pickChangeBlockReasons: FinalistPickChangeBlockReason[] = [],
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/gran-final",
          action: async ({ request }): Promise<GrandFinalListActionData> => {
            submitted.push(await request.formData());

            return {
              message: "Guardaste la elección de finalista.",
              status: "success",
            };
          },
          element: (
            <GrandFinalListView
              loaderData={{
                pickChangeBlockReasons,
                picks: loaderPicks,
                selectedEventId: "evento",
                voteCodeBatches: [],
                votingRound: null,
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/gran-final"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  /** Each row of the modality's table as its academy, its marks and a cell per judge. */
  function readTable(modalityName: string) {
    const section = [...document.querySelectorAll("section")].find(
      (element) => element.querySelector("h3")?.textContent === modalityName,
    );
    const headers = [...(section?.querySelectorAll("thead th") ?? [])].map(
      (cell) => cell.textContent,
    );
    const rows = [...(section?.querySelectorAll("tbody tr") ?? [])].map((row) =>
      [...row.querySelectorAll("td")].map(
        (cell) =>
          cell.querySelector("[aria-label]")?.getAttribute("aria-label") ??
          cell.textContent,
      ),
    );

    return { headers, rows };
  }

  test("shows, per modality, which academy each judge picked and marks the finalists", async () => {
    await mount();

    expect(readTable("Danza Jazz")).toEqual({
      headers: ["Academia", "Banners", "Ana Juez", "Bruno Juez", "Carla Juez"],
      rows: [
        ["Academia PiruetaFinalista", "Cargados", "—", "—", "—"],
        ["Academia VecinaFinalista", "Falta 1", "Elegida", "Elegida", "—"],
      ],
    });
    expect(readTable("Tap").rows).toEqual([
      ["Academia PiruetaFinalista", "Cargados", "—", "—", "Elegida"],
      ["Academia Zapateo", "—", "—", "—", "—"],
    ]);
  });

  test("changes a judge's pick from the judge's current one", async () => {
    await mount();

    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      document.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    });

    const [modality, judge, academy] = document.querySelectorAll(
      '[role="dialog"] [data-slot="select-trigger"]',
    );

    await openRadixSelect(modality);
    await selectRadixOption("Danza Jazz");
    await openRadixSelect(judge);
    await selectRadixOption("Bruno Juez");

    expect(academy.textContent).toContain("Academia Vecina");
    expect(findButton("Guardar", { exact: true })?.disabled).toBe(true);

    await openRadixSelect(academy);
    await selectRadixOption("Academia Pirueta");
    await updateReactDomForm(() => {
      findButton("Guardar", { exact: true })?.click();
    });

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      academyId: "pirueta",
      intent: "set-finalist-pick",
      judgeId: "bruno",
      modalityId: "jazz",
    });
  });

  // Regression: Ana and Bruno share a pick, so moving from one to the other
  // left the academy unchanged and Ana's unsaved choice went to Bruno.
  test("drops an unsaved choice when the dialog moves to another judge with the same pick", async () => {
    await mount();

    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      document.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    });

    const [modality, judge, academy] = document.querySelectorAll(
      '[role="dialog"] [data-slot="select-trigger"]',
    );

    await openRadixSelect(modality);
    await selectRadixOption("Danza Jazz");
    await openRadixSelect(judge);
    await selectRadixOption("Ana Juez");
    await openRadixSelect(academy);
    await selectRadixOption("Academia Pirueta");
    await openRadixSelect(judge);
    await selectRadixOption("Bruno Juez");

    expect(academy.textContent).toContain("Academia Vecina");
    expect(findButton("Guardar", { exact: true })?.disabled).toBe(true);
  });

  test("asks before closing the dialog over an academy chosen and not saved", async () => {
    await mount();

    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      document.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    });

    const [modality, judge, academy] = document.querySelectorAll(
      '[role="dialog"] [data-slot="select-trigger"]',
    );

    await openRadixSelect(modality);
    await selectRadixOption("Tap");
    await openRadixSelect(judge);
    await selectRadixOption("Ana Juez");
    await openRadixSelect(academy);
    await selectRadixOption("Academia Zapateo");
    await updateReactDomForm(() => {
      findButton("Cancelar", { exact: true })?.click();
    });

    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(submitted).toHaveLength(0);
  });

  test("opens the reasons instead of the form when the change is blocked", async () => {
    await mount({ ...picks, judges: [] }, [
      {
        code: "no-event-judge",
        label:
          "El evento activo todavía no tiene jueces asignados a sus presentaciones.",
      },
    ]);

    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      document.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    });

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("No se puede cambiar la elección de finalista");
    expect(findButton("Guardar", { exact: true })).toBeUndefined();
  });
});
