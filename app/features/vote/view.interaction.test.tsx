/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { VoteActionData, VotePageData } from "./shared";
import { VotePageView } from "./view";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const finalists = [
  {
    academyId: "alas",
    city: "Córdoba",
    name: "Alas",
    pictureUrls: ["/alas-1.jpg", "/alas-2.jpg"],
  },
  {
    academyId: "ritmo",
    city: null,
    name: "Ritmo Sur",
    pictureUrls: ["/ritmo-1.jpg", "/ritmo-2.jpg"],
  },
];

describe("the public vote page", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];
  let answer: VoteActionData;

  beforeEach(() => {
    submitted.length = 0;
    answer = { message: "La votación ya no está abierta.", status: "error" };
    vi.mocked(toast.error).mockClear();
  });

  afterEach(renderer.cleanup);

  async function mount(page: VotePageData) {
    const router = createMemoryRouter(
      [
        {
          path: "/votar",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return answer;
          },
          element: <VotePageView page={page} />,
        },
      ],
      { initialEntries: ["/votar"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  /** Chooses the academy whose card names it, then confirms from the bar. */
  async function voteFor(name: string) {
    const card = [...document.querySelectorAll("li")].find((item) =>
      item.textContent?.includes(name),
    );
    await clickReactDomButton("Elegir esta academia", {
      exact: true,
      within: card,
    });
    await clickReactDomButton("Confirmar voto", { exact: true });
  }

  // Before the round, after it, and once the code voted, the page offers no
  // way to vote at all.
  test.each([
    { page: { state: "not-open" } as const },
    { page: { state: "closed" } as const },
    {
      page: {
        canAlsoSignIn: false,
        finalist: finalists[0],
        state: "registered",
      } as const,
    },
  ])("offers no vote while the page is $page.state", async ({ page }) => {
    await mount(page);

    expect(document.querySelector("form")).toBeNull();
    expect(
      [...document.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Elegir esta academia|Confirmar voto/),
      ]),
    );
  });

  test("sends the academy chosen with the code the visitor arrived with", async () => {
    await mount({
      blockReasons: [],
      code: "codigo-impreso",
      finalists,
      googleSignIn: null,
      state: "open",
    });

    await voteFor("Ritmo Sur");

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      academyId: "ritmo",
      codigo: "codigo-impreso",
    });
  });

  test("tells a refused vote in a toast", async () => {
    await mount({
      blockReasons: [],
      code: "codigo-impreso",
      finalists,
      googleSignIn: null,
      state: "open",
    });

    await voteFor("Alas");

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "La votación ya no está abierta.",
      expect.anything(),
    );
  });

  test("sends a signed-in voter's choice with no code, and tells a refusal in a toast", async () => {
    answer = {
      message:
        "Tu ingreso con Google ya no es válido. Ingresá de nuevo para votar.",
      status: "error",
    };
    await mount({
      blockReasons: [],
      code: null,
      finalists,
      googleSignIn: "signed-in",
      state: "open",
    });

    await voteFor("Alas");

    // Waits for its own toast: an earlier test's may still land first.
    await waitFor(() =>
      vi
        .mocked(toast.error)
        .mock.calls.some(([message]) => message === answer.message),
    );
    expect(Object.fromEntries(submitted[0])).toEqual({
      academyId: "alas",
      codigo: "",
    });
    expect(toast.error).toHaveBeenCalledWith(answer.message, expect.anything());
  });

  test("opens why a visitor without a valid code cannot vote, and sends nothing", async () => {
    const label =
      "Este código QR fue anulado por la organización y ya no sirve para votar.";
    await mount({
      blockReasons: [{ code: "voided-code", label }],
      code: null,
      finalists,
      googleSignIn: "offered",
      state: "open",
    });

    await voteFor("Alas");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain(label);
    expect(submitted).toHaveLength(0);
  });
});
