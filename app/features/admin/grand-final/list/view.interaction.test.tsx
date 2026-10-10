/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { GrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { GrandFinalListResult } from "./shared";
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
 * picked Brisa there, and only Carla picked in Tap. Pirueta is a finalist
 * through Tap, so it is marked in Jazz too, where nobody picked it. Pirueta
 * has both banners, Vecina one, and Brisa none.
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
        {
          academyId: "brisa",
          bannerCount: 0,
          eligible: true,
          finalist: true,
          name: "Academia Brisa",
          pickedByJudgeIds: ["carla"],
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

  afterEach(renderer.cleanup);

  async function mount(
    loaderPicks: GrandFinalPicks = picks,
    lists: Pick<GrandFinalListResult, "auditLinks" | "voteCodeBatches"> = {
      auditLinks: [],
      voteCodeBatches: [],
    },
    entry = "/administracion/gran-final",
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/gran-final",
          element: (
            <GrandFinalListView
              loaderData={{
                auditLinkCreateBlockReasons: [],
                auditLinks: lists.auditLinks,
                picks: loaderPicks,
                selectedEventId: "evento",
                voteCodeBatches: lists.voteCodeBatches,
                votingRound: null,
              }}
            />
          ),
        },
      ],
      { initialEntries: [entry] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  const noLists = { auditLinks: [], voteCodeBatches: [] };

  /**
   * Each row of the table under the active tab, as its cells' text, with a
   * finalist's name marked as the link it is.
   */
  function readTable() {
    const panel = document.querySelector(
      '[role="tabpanel"][data-state="active"]',
    );
    const headers = [...(panel?.querySelectorAll("thead th") ?? [])].map(
      (cell) => cell.textContent,
    );
    const rows = [...(panel?.querySelectorAll("tbody tr") ?? [])].map((row) =>
      [...row.querySelectorAll("td")].map((cell) =>
        cell.querySelector("a") ? `link:${cell.textContent}` : cell.textContent,
      ),
    );

    return { headers, rows };
  }

  test("lists each academy in each modality it qualifies in, with its banners' state", async () => {
    await mount();

    expect(readTable()).toEqual({
      headers: ["Academia", "Modalidad", "Estado"],
      rows: [
        ["link:Academia Pirueta", "Danza Jazz", "Completo"],
        ["link:Academia Vecina", "Danza Jazz", "Incompleto"],
        ["link:Academia Brisa", "Danza Jazz", "Sin imágenes"],
        ["link:Academia Pirueta", "Tap", "Completo"],
        ["link:Academia Zapateo", "Tap", "—"],
      ],
    });
  });

  test("finds an academy by the name of a judge who picked it", async () => {
    await mount(picks, noLists, "/administracion/gran-final?busqueda=bruno");

    expect(readTable().rows).toEqual([
      ["link:Academia Vecina", "Danza Jazz", "Incompleto"],
    ]);
  });

  test("finds an academy by its own name, in every modality", async () => {
    await mount(picks, noLists, "/administracion/gran-final?busqueda=pirueta");

    expect(readTable().rows.map((row) => row[1])).toEqual([
      "Danza Jazz",
      "Tap",
    ]);
  });

  test("filters the academies by modality", async () => {
    await mount(picks, noLists, "/administracion/gran-final?modalidad=tap");

    expect(readTable().rows).toEqual([
      ["link:Academia Pirueta", "Tap", "Completo"],
      ["link:Academia Zapateo", "Tap", "—"],
    ]);
  });
});
