/** @vitest-environment jsdom */

import {
  createMemoryRouter,
  redirect,
  RouterProvider,
  useActionData,
} from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AuditTotals } from "@/lib/grand-final/audit-totals.server";
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
      distinctVoters: 4,
      finalists: [
        {
          academyId: "alas",
          city: "Córdoba",
          codeVotes: 3,
          name: "Alas",
          percentage: 88.2,
          points: 30,
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

  beforeEach(() => {
    submitted.length = 0;
    answer = { reason: "already-bound" };
    vi.mocked(toast.error).mockClear();
  });

  afterEach(renderer.cleanup);

  function Page({ page }: { page: AuditPageData }) {
    const actionData = useActionData<AuditActionData | UnexpectedActionError>();

    return <AuditPageView actionData={actionData} page={page} />;
  }

  async function mount(page: AuditPageData, entry = "/auditoria") {
    const router = createMemoryRouter(
      [
        {
          path: "/auditoria",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return answer;
          },
          element: <Page page={page} />,
        },
      ],
      { initialEntries: [entry] },
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

  test("shows the refusal of a link another device opened first", async () => {
    await mount({ state: "open-link" }, linkEntry);

    await openLink();

    await waitFor(() =>
      pageText().includes("Este acceso ya se abrió en otro dispositivo"),
    );
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
});
