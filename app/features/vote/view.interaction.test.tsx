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

/** A Desempate that stayed tied: two winners sharing the first place. */
const publishedPage: VotePageData = {
  ranking: [
    {
      academyId: "alas",
      city: "Córdoba",
      name: "Alas",
      percentage: 41.2,
      position: 1,
      winner: true,
    },
    {
      academyId: "ritmo",
      city: null,
      name: "Ritmo Sur",
      percentage: 41.2,
      position: 1,
      winner: true,
    },
    {
      academyId: "sol",
      city: null,
      name: "Sol",
      percentage: 17.6,
      position: 3,
      winner: false,
    },
  ],
  roundNumber: 2,
  state: "published",
  tieBrokenByCodeVotes: false,
};

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

  // Before the round, after it, once the code voted, and to a code that
  // cannot vote, the page offers no way to vote at all.
  test.each([
    { page: { state: "not-open" } as const },
    { page: { state: "closed" } as const },
    {
      page: { finalist: finalists[0], state: "registered" } as const,
    },
    { page: publishedPage },
    { page: { reason: "voided-code", state: "code-refused" } as const },
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

  test("offers the sign-in with Google in a phone's own browser", async () => {
    await mount({ google: true, inAppBrowser: null, state: "sign-in" });

    expect(document.body.textContent).toContain("Ingresar con Google");
  });

  // Google refuses the sign-in there, so the button would only lead to an
  // error page: the page sends the visitor to the phone's browser instead.
  test("in Instagram's browser on an iPhone, says how to open the page in the phone's browser instead of offering Google", async () => {
    await mount({
      google: true,
      inAppBrowser: { androidIntentUrl: null, app: "Instagram" },
      state: "sign-in",
    });

    expect(document.body.textContent).not.toContain("Ingresar con Google");
    expect(document.body.textContent).toContain(
      "Instagram no permite ingresar con Google desde su navegador.",
    );
    expect(document.body.textContent).toContain(
      "Tocá el menú ⋯ de arriba a la derecha",
    );
    expect(document.querySelector("a[href^='intent:']")).toBeNull();
  });

  test("in Instagram's browser on Android, links to the page in the phone's browser", async () => {
    await mount({
      google: true,
      inAppBrowser: {
        androidIntentUrl:
          "intent://sistema.enescena.com.ar/votar#Intent;scheme=https;end",
        app: "Instagram",
      },
      state: "sign-in",
    });

    expect(document.body.textContent).not.toContain("Ingresar con Google");
    const link = [...document.querySelectorAll("a")].find((anchor) =>
      anchor.textContent?.includes("Abrir en el navegador"),
    );
    expect(link?.getAttribute("href")).toBe(
      "intent://sistema.enescena.com.ar/votar#Intent;scheme=https;end",
    );
  });

  test("sends the academy chosen with the code the visitor arrived with", async () => {
    await mount({
      code: "codigo-impreso",
      finalists,
      roundId: "ronda-1",
      state: "open",
    });

    await voteFor("Ritmo Sur");

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      academyId: "ritmo",
      codigo: "codigo-impreso",
      roundId: "ronda-1",
    });
  });

  test("tells a refused vote in a toast", async () => {
    await mount({
      code: "codigo-impreso",
      finalists,
      roundId: "ronda-1",
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
      code: null,
      finalists,
      roundId: "ronda-1",
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
      roundId: "ronda-1",
    });
    expect(toast.error).toHaveBeenCalledWith(answer.message, expect.anything());
  });
});
