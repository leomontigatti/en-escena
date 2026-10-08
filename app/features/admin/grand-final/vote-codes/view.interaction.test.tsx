/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { openRadixSelect } from "@/lib/test-support/radix-select";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { GrandFinalListActionData } from "../list/shared";
import { GrandFinalListView } from "../list/view";
import { voteCodeCountMessage, type VoteCodeBatchListRow } from "./shared";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const batches: VoteCodeBatchListRow[] = [
  {
    blockReasons: [],
    codeCount: 200,
    id: "lote-2",
    issuedAt: new Date("2026-10-21T22:00:00Z"),
    number: 2,
    voidedAt: null,
  },
  {
    blockReasons: [
      {
        code: "voided",
        label:
          "El lote 1 fue anulado el 20/10/26: sus códigos QR ya no sirven para votar.",
      },
    ],
    codeCount: 50,
    id: "lote-1",
    issuedAt: new Date("2026-10-20T22:00:00Z"),
    number: 1,
    voidedAt: new Date("2026-10-21T01:00:00Z"),
  },
];

describe("the QR code batches of administration's `Gran final` list", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];
  let answer: GrandFinalListActionData;

  beforeEach(() => {
    submitted.length = 0;
    answer = { message: "Listo.", status: "success" };
    vi.mocked(toast.error).mockClear();
  });

  afterEach(renderer.cleanup);

  async function mount() {
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
                voteCodeBatches: batches,
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/gran-final"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  async function openGenerateDialog() {
    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "Generar códigos QR")
        ?.click();
    });
  }

  async function generate(count: string) {
    await openGenerateDialog();
    const input = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[name="count"]',
    );

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, count);
      }
    });
    await clickReactDomButton("Generar", { exact: true });
  }

  test("generates a batch of the count typed", async () => {
    await mount();

    await generate("200");

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      count: "200",
      intent: "create-vote-code-batch",
    });
  });

  test("keeps a count over the limit from leaving the dialog", async () => {
    await mount();

    await generate("1001");

    await waitFor(() =>
      Boolean(document.body.textContent?.includes(voteCodeCountMessage)),
    );
    expect(submitted).toHaveLength(0);
  });

  test("tells a refused generation in a toast", async () => {
    answer = {
      message: "Elegí un evento activo para generar o anular códigos QR.",
      status: "error",
    };
    await mount();

    await generate("10");

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "Elegí un evento activo para generar o anular códigos QR.",
      expect.anything(),
    );
  });

  test("voids a batch once its confirmation names it", async () => {
    await mount();

    await clickReactDomButton("Anular", { exact: true });

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("¿Anular el lote 2?");

    await clickReactDomButton("Anular", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      batchId: "lote-2",
      intent: "void-vote-code-batch",
    });
  });

  test("tells a refused void in a toast", async () => {
    answer = {
      message:
        "Ese lote ya estaba anulado. Sus códigos QR no sirven para votar.",
      status: "error",
    };
    await mount();

    await clickReactDomButton("Anular", { exact: true });
    await clickReactDomButton("Anular", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "Ese lote ya estaba anulado. Sus códigos QR no sirven para votar.",
      expect.anything(),
    );
  });

  test("opens why a voided batch cannot be voided again, and sends nothing", async () => {
    await mount();

    const voidedRow = [...document.querySelectorAll("tbody tr")].find((row) =>
      row.textContent?.includes("Lote 1"),
    );
    await clickReactDomButton("Anular", { exact: true, within: voidedRow });

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain(
      "El lote 1 fue anulado el 20/10/26: sus códigos QR ya no sirven para votar.",
    );
    expect(submitted).toHaveLength(0);
  });
});
