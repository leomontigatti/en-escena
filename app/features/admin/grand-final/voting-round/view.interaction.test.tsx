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
  openBlockReasons: [],
  status: null,
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

  test("closes the open round once its confirmation is accepted", async () => {
    await mount({
      closeBlockReasons: [],
      openBlockReasons: [
        { code: "already-open", label: "La votación ya está abierta." },
      ],
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
});
