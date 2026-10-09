/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { openRadixSelect } from "@/lib/test-support/radix-select";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { GrandFinalListActionData } from "../list/shared";
import { GrandFinalListView } from "../list/view";
import type { VotingRoundListState } from "./shared";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const readyToOpen: VotingRoundListState = {
  closeBlockReasons: [
    { code: "not-open", label: "La votación no está abierta." },
  ],
  hideBlockReasons: [
    { code: "not-published", label: "El resultado no está publicado." },
  ],
  openBlockReasons: [],
  publishBlockReasons: [
    { code: "no-round", label: "La votación todavía no se abrió." },
  ],
  result: null,
  roundId: null,
  status: null,
  tieBreakBlockReasons: [
    { code: "no-round", label: "La votación todavía no se abrió." },
  ],
};

/** Round 1 closed with a tie for first place, the result unpublished. */
const tiedRoundOne: VotingRoundListState = {
  ...readyToOpen,
  openBlockReasons: [
    {
      code: "already-closed",
      label:
        "La votación ya se cerró y no se vuelve a abrir. Si terminó con empate en el primer puesto, abrí el desempate.",
    },
  ],
  publishBlockReasons: [
    {
      code: "tie-pending",
      label:
        "Hay un empate en el primer puesto: abrí el desempate antes de publicar.",
    },
  ],
  result: {
    entries: [],
    outcome: { academyIds: ["alas", "ritmo"], kind: "tie" },
    published: false,
    roundNumber: 1,
    tieBrokenByCodeVotes: false,
  },
  status: "closed",
  tieBreakBlockReasons: [],
};

/** A closed round with one winner, its result published. */
const publishedResult: VotingRoundListState = {
  ...readyToOpen,
  hideBlockReasons: [],
  publishBlockReasons: [
    { code: "already-published", label: "El resultado ya está publicado." },
  ],
  result: {
    entries: [],
    outcome: { academyIds: ["alas"], kind: "winner" },
    published: true,
    roundNumber: 1,
    tieBrokenByCodeVotes: false,
  },
  status: "closed",
  tieBreakBlockReasons: [
    {
      code: "no-tie",
      label: "La votación no terminó con empate en el primer puesto.",
    },
  ],
};

describe("the voting round actions of administration's `Gran final` list", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];
  let answer: GrandFinalListActionData;

  beforeEach(() => {
    submitted.length = 0;
    answer = { message: "Listo.", status: "success" };
    vi.mocked(toast.error).mockClear();
  });

  afterEach(renderer.cleanup);

  async function mount(votingRound: VotingRoundListState) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/gran-final",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return answer;
          },
          element: (
            <GrandFinalListView
              loaderData={{
                auditLinkCreateBlockReasons: [],
                auditLinks: [],
                pickChangeBlockReasons: [],
                picks: { judges: [], modalities: [] },
                selectedEventId: "evento",
                voteCodeBatches: [],
                votingRound,
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/gran-final"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  async function chooseFromActions(label: string) {
    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === label)
        ?.click();
    });
  }

  function alertDialogText() {
    return document.querySelector('[role="alertdialog"]')?.textContent ?? "";
  }

  test("opens the round once its confirmation is accepted", async () => {
    await mount(readyToOpen);

    await chooseFromActions("Abrir votación");
    expect(alertDialogText()).toContain("¿Abrir la votación?");
    await clickReactDomButton("Abrir votación", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "open-voting-round",
    });
  });

  test("tells a refused open in a toast", async () => {
    answer = {
      message:
        "No se puede abrir la votación. Faltan banners de Ritmo Sur: cada finalista necesita sus dos banners.",
      status: "error",
    };
    await mount(readyToOpen);

    await chooseFromActions("Abrir votación");
    await clickReactDomButton("Abrir votación", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "No se puede abrir la votación. Faltan banners de Ritmo Sur: cada finalista necesita sus dos banners.",
      expect.anything(),
    );
  });

  test("opens every reason the round cannot open, and sends nothing", async () => {
    await mount({
      ...readyToOpen,
      openBlockReasons: [
        {
          code: "missing-banners",
          label:
            "Faltan banners de Alas, Ritmo Sur: cada finalista necesita sus dos banners.",
        },
      ],
    });

    await chooseFromActions("Abrir votación");

    expect(alertDialogText()).toContain("No se puede abrir la votación");
    expect(alertDialogText()).toContain(
      "Faltan banners de Alas, Ritmo Sur: cada finalista necesita sus dos banners.",
    );
    expect(submitted).toHaveLength(0);
  });

  test("closes the round it shows once its confirmation is accepted, naming it", async () => {
    await mount({
      ...readyToOpen,
      closeBlockReasons: [],
      openBlockReasons: [
        { code: "already-open", label: "La votación ya está abierta." },
      ],
      roundId: "ronda-1",
      status: "open",
    });

    await chooseFromActions("Cerrar votación");
    await clickReactDomButton("Cerrar votación", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "close-voting-round",
      roundId: "ronda-1",
    });
  });

  test("tells a refused close in a toast", async () => {
    answer = {
      message: "No se puede cerrar la votación. La votación no está abierta.",
      status: "error",
    };
    await mount({ ...readyToOpen, closeBlockReasons: [], status: "open" });

    await chooseFromActions("Cerrar votación");
    await clickReactDomButton("Cerrar votación", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "No se puede cerrar la votación. La votación no está abierta.",
      expect.anything(),
    );
  });

  test("opens the Desempate once its confirmation is accepted", async () => {
    await mount(tiedRoundOne);

    await chooseFromActions("Abrir desempate");
    expect(alertDialogText()).toContain("¿Abrir el desempate?");
    await clickReactDomButton("Abrir desempate", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "open-tie-break-round",
    });
  });

  test("tells why a round 1 tie cannot be published, and sends nothing", async () => {
    await mount(tiedRoundOne);

    await chooseFromActions("Publicar resultado");

    expect(alertDialogText()).toContain("No se puede publicar el resultado");
    expect(alertDialogText()).toContain(
      "Hay un empate en el primer puesto: abrí el desempate antes de publicar.",
    );
    expect(submitted).toHaveLength(0);
  });

  test("publishes a result once its confirmation is accepted, and tells a refusal in a toast", async () => {
    answer = {
      message:
        "No se puede publicar el resultado. El resultado ya está publicado.",
      status: "error",
    };
    await mount({
      ...publishedResult,
      hideBlockReasons: tiedRoundOne.hideBlockReasons,
      publishBlockReasons: [],
      result: null,
    });

    await chooseFromActions("Publicar resultado");
    await clickReactDomButton("Publicar resultado", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "publish-grand-final-result",
    });
    expect(toast.error).toHaveBeenCalledWith(
      "No se puede publicar el resultado. El resultado ya está publicado.",
      expect.anything(),
    );
  });

  test("hides a published result once its confirmation is accepted", async () => {
    await mount(publishedResult);

    await chooseFromActions("Ocultar resultado");
    await clickReactDomButton("Ocultar resultado", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "hide-grand-final-result",
    });
  });

  test("tells why a Desempate cannot open after a round with one winner", async () => {
    await mount(publishedResult);

    await chooseFromActions("Abrir desempate");

    expect(alertDialogText()).toContain("No se puede abrir el desempate");
    expect(alertDialogText()).toContain(
      "La votación no terminó con empate en el primer puesto.",
    );
    expect(submitted).toHaveLength(0);
  });
});
