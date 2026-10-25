/** @vitest-environment jsdom */

import { act } from "react";
import {
  createMemoryRouter,
  redirect,
  RouterProvider,
  useActionData,
  useLoaderData,
} from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AuditTotals } from "@/lib/grand-final/audit-totals.server";
import { createKeptLoaderData } from "@/lib/shared/kept-loader-data";
import type { UnexpectedActionError } from "@/lib/shared/recoverable-client-action";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { AuditActionData, AuditPageData } from "./shared";
import { AuditPageView } from "./view";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function openTotals(
  overrides: Partial<Extract<AuditTotals, { status: "open" }>> = {},
): AuditPageData {
  return {
    state: "totals",
    totals: {
      codes: { consumed: 3, issued: 10, voided: 0 },
      countedAt: new Date(),
      distinctVoters: 4,
      finalists: [
        {
          academyId: "alas",
          city: "Córdoba",
          codeVotes: 3,
          name: "Alas",
          percentage: 95.7,
          points: 90,
          position: 1,
          voterVotes: 0,
        },
      ],
      roundNumber: 1,
      status: "open",
      ...overrides,
    },
  };
}

const linkEntry = "/auditoria#token-del-enlace";

describe("the audit page", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];
  let answer: AuditActionData | UnexpectedActionError | Response;
  /** What the server answers each later load: the page as it was, by default. */
  let serverLoader: ReturnType<typeof vi.fn<() => Promise<AuditPageData>>>;

  beforeEach(() => {
    submitted.length = 0;
    answer = { reason: "revoked" };
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    renderer.cleanup();
    vi.useRealTimers();
    // The jsdom document is shared with the files after this one.
    Reflect.deleteProperty(document, "visibilityState");
  });

  function Page() {
    const actionData = useActionData<AuditActionData | UnexpectedActionError>();
    const page = useLoaderData<AuditPageData>();

    return <AuditPageView actionData={actionData} page={page} />;
  }

  async function mount(page: AuditPageData, entry = "/auditoria") {
    // The route's `clientLoader` does the same: a failed load keeps the page.
    const kept = createKeptLoaderData<AuditPageData>();
    kept.remember(page);
    serverLoader = vi.fn(() => Promise.resolve(page));

    const router = createMemoryRouter(
      [
        {
          id: "audit",
          path: "/auditoria",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return answer;
          },
          loader: () => kept.reload(serverLoader),
          element: <Page />,
        },
      ],
      {
        hydrationData: { loaderData: { audit: page } },
        initialEntries: [entry],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  const pageText = () => document.body.textContent ?? "";

  async function openLink() {
    await waitFor(() =>
      Boolean(
        document.querySelector<HTMLButtonElement>(
          'button[type="submit"]:not([disabled])',
        ),
      ),
    );
    await clickReactDomButton("Abrir en este dispositivo", { exact: true });
  }

  test("sends the link's token from the address in the form", async () => {
    await mount({ state: "open-link" }, linkEntry);

    await openLink();

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      token: "token-del-enlace",
    });
  });

  test("lands on the totals once the link opened, the token gone from the address", async () => {
    answer = redirect("/auditoria");
    await mount(openTotals(), linkEntry);

    await openLink();

    await waitFor(() => pageText().includes("Totales de la Gran final"));
    expect(document.querySelector("form")).toBeNull();
  });

  test("opens a link in the address over the totals of one opened before", async () => {
    await mount(openTotals(), "/auditoria#token-nuevo");

    await openLink();

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({ token: "token-nuevo" });
  });

  test("shows the refusal of a revoked link", async () => {
    await mount({ state: "open-link" }, linkEntry);

    await openLink();

    await waitFor(() => pageText().includes("Este acceso fue revocado"));
    expect(document.querySelector("form")).toBeNull();
  });

  test("tells an unexpected failure in a toast and keeps the form", async () => {
    answer = {
      message: "No pudimos completar la acción. Intentá nuevamente.",
      status: "error",
    };
    await mount({ state: "open-link" }, linkEntry);

    await openLink();

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "No pudimos completar la acción. Intentá nuevamente.",
      expect.anything(),
    );
    expect(document.querySelector("form")).not.toBeNull();
  });

  test("asks for the link when the address carries no token", async () => {
    await mount({ state: "open-link" });

    await waitFor(() => pageText().includes("Abrí el enlace de auditoría"));
    expect(document.querySelector("form")).toBeNull();
  });

  test.each([
    { roundNumber: 1, words: "Votación abierta" },
    { roundNumber: 2, words: "Desempate abierta" },
  ])("names round $roundNumber as $words", async ({ roundNumber, words }) => {
    await mount(openTotals({ roundNumber }));

    expect(pageText()).toContain(words);
  });

  test("tells voided codes apart only when a batch was voided", async () => {
    await mount(openTotals());
    expect(pageText()).not.toContain("anulados");
    renderer.cleanup();

    await mount(openTotals({ codes: { consumed: 3, issued: 10, voided: 2 } }));
    expect(pageText()).toContain("2 anulados");
  });

  test.each([
    { roundNumber: 1, status: "closed" } as const,
    { status: "not-open" } as const,
  ])("shows no figure while the round is $status", async (totals) => {
    await mount({ state: "totals", totals });

    expect(document.querySelector("dl")).toBeNull();
  });

  describe("brought up to date on its own", () => {
    const pollMs = 10_000;

    function fakeClock() {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      vi.setSystemTime(new Date("2026-11-14T22:00:00-03:00"));
    }

    async function advance(milliseconds: number) {
      await act(async () => {
        vi.advanceTimersByTime(milliseconds);
      });
    }

    function setVisibility(state: DocumentVisibilityState) {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    test("offers no button to update the totals", async () => {
      await mount(openTotals());

      expect(document.querySelector("button")).toBeNull();
    });

    test("brings the totals up to date every ten seconds", async () => {
      fakeClock();
      await mount(openTotals());
      serverLoader.mockResolvedValue(
        openTotals({ codes: { consumed: 5, issued: 10, voided: 0 } }),
      );

      await advance(pollMs - 1);
      expect(serverLoader).not.toHaveBeenCalled();

      await advance(1);
      await waitFor(() => pageText().includes("5 de 10"));
    });

    test("turns to the totals when the round opens, with no reload", async () => {
      fakeClock();
      await mount({ state: "totals", totals: { status: "not-open" } });
      serverLoader.mockResolvedValue(openTotals());

      await advance(pollMs);

      await waitFor(() => pageText().includes("Totales de la Gran final"));
    });

    test.each([
      {
        name: "the round closed",
        page: {
          state: "totals",
          totals: { roundNumber: 1, status: "closed" },
        } as const,
      },
      {
        name: "the link was revoked",
        page: { reason: "revoked", state: "refused" } as const,
      },
    ])("stops asking once $name", async ({ page }) => {
      fakeClock();
      await mount(page);

      await advance(pollMs * 3);

      expect(serverLoader).not.toHaveBeenCalled();
    });

    test("waits while the page is hidden and asks as soon as it is seen again", async () => {
      fakeClock();
      await mount(openTotals());

      setVisibility("hidden");
      await advance(pollMs * 3);
      expect(serverLoader).not.toHaveBeenCalled();

      setVisibility("visible");
      await waitFor(() => serverLoader.mock.calls.length === 1);
    });

    test("says how long ago the totals were counted", async () => {
      fakeClock();
      await mount(openTotals());

      await waitFor(() => pageText().includes("Actualizado recién"));

      await advance(7000);
      expect(pageText()).toContain("Actualizado hace 7 s");

      await advance(2 * 60_000);
      expect(pageText()).toContain("Actualizado hace 2 min");
    });

    test("keeps the totals on screen when an update fails, and lets them age", async () => {
      fakeClock();
      await mount(openTotals());
      serverLoader.mockRejectedValue(new TypeError("Failed to fetch"));

      await advance(pollMs);
      await waitFor(() => serverLoader.mock.calls.length === 1);
      await advance(pollMs);
      await waitFor(() => serverLoader.mock.calls.length === 2);

      expect(pageText()).toContain("3 de 10");
      expect(pageText()).toContain("Actualizado hace 20 s");
    });
  });
});
