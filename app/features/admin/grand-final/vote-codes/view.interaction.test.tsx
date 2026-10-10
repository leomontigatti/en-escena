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
          "El lote 1 fue anulado el 20 de octubre de 2026: sus códigos QR ya no sirven para votar.",
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
                auditLinkCreateBlockReasons: [],
                auditLinks: [],
                picks: { judges: [], modalities: [] },
                selectedEventId: "evento",
                voteCodeBatches: batches,
                votingRound: null,
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/gran-final?lista=codigos-qr"] },
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

  test("waits for a count before it generates", async () => {
    await mount();

    await openGenerateDialog();

    expect(findButton("Generar", { exact: true })?.disabled).toBe(true);
  });

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

  async function openBatch(name: string) {
    const row = [...document.querySelectorAll("tbody tr")].find((item) =>
      item.textContent?.includes(name),
    );

    await clickReactDomButton(name, { exact: true, within: row });
  }

  test("opens a batch from its name, with its print sheet", async () => {
    await mount();

    await openBatch("Lote 2");

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("200 códigos QR");
    expect(
      [...(dialog?.querySelectorAll("a") ?? [])]
        .find((link) => link.textContent === "Imprimir")
        ?.getAttribute("href"),
    ).toBe("/administracion/gran-final/codigos-qr/lote-2");
  });

  test("voids a batch from its dialog once the confirmation names it", async () => {
    await mount();

    await openBatch("Lote 2");
    await clickReactDomButton("Anular", {
      exact: true,
      within: document.querySelector('[role="dialog"]'),
    });

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

    await openBatch("Lote 2");
    await clickReactDomButton("Anular", {
      exact: true,
      within: document.querySelector('[role="dialog"]'),
    });
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

  test("opens why a voided batch can be neither printed nor voided, and sends nothing", async () => {
    await mount();

    await openBatch("Lote 1");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain(
      "El lote 1 fue anulado el 20 de octubre de 2026: sus códigos QR ya no sirven para votar.",
    );
    expect(submitted).toHaveLength(0);
  });
});
