/** @vitest-environment jsdom */

import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router";
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

import type {
  GrandFinalListActionData,
  GrandFinalListResult,
} from "../list/shared";
import { GrandFinalListView } from "../list/view";
import {
  auditLinkLimitMessage,
  type AuditLinkCreateBlockReason,
  type AuditLinkListRow,
} from "./shared";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const links: AuditLinkListRow[] = [
  {
    blockReasons: [],
    createdAt: new Date("2026-10-21T22:00:00Z"),
    id: "acceso-marta",
    label: "Marta",
    openedAt: new Date("2026-10-21T22:30:00Z"),
    revokedAt: null,
  },
  {
    blockReasons: [
      {
        code: "revoked",
        label: "El acceso de Jorge ya fue revocado el 21 de octubre de 2026.",
      },
    ],
    createdAt: new Date("2026-10-21T22:00:00Z"),
    id: "acceso-jorge",
    label: "Jorge",
    openedAt: null,
    revokedAt: new Date("2026-10-21T23:00:00Z"),
  },
];

const shownAnswer: GrandFinalListActionData = {
  auditLink: {
    label: "Marta",
    qrDataUri: "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E",
    url: "https://sistema.enescena.com.ar/auditoria#token-de-marta",
  },
  message: "",
  status: "success",
};

const createdAnswer: GrandFinalListActionData = {
  auditLink: {
    label: "Ana",
    qrDataUri: "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E",
    url: "https://sistema.enescena.com.ar/auditoria#token-del-enlace",
  },
  message: "Creaste el acceso de auditoría de Ana.",
  status: "success",
};

describe("the audit links of administration's `Gran final` list", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];
  let answer: GrandFinalListActionData;
  let showAnswer: GrandFinalListActionData;

  beforeEach(() => {
    submitted.length = 0;
    answer = createdAnswer;
    showAnswer = shownAnswer;
    blockReasonsAfterAction = null;
    vi.mocked(toast.error).mockClear();
  });

  afterEach(renderer.cleanup);

  /** The list as the loader reads it, which a test changes after an action. */
  let blockReasonsAfterAction: AuditLinkCreateBlockReason[] | null;

  function ListRoute() {
    return (
      <GrandFinalListView loaderData={useLoaderData<GrandFinalListResult>()} />
    );
  }

  async function mount(
    auditLinkCreateBlockReasons: AuditLinkCreateBlockReason[] = [],
  ) {
    let blockReasons = auditLinkCreateBlockReasons;
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/gran-final",
          action: async ({ request }) => {
            const formData = await request.formData();
            submitted.push(formData);
            blockReasons = blockReasonsAfterAction ?? blockReasons;

            return formData.get("intent") === "show-audit-link"
              ? showAnswer
              : answer;
          },
          Component: ListRoute,
          loader: (): GrandFinalListResult => ({
            auditLinkCreateBlockReasons: blockReasons,
            auditLinks: links,
            picks: { judges: [], modalities: [] },
            selectedEventId: "evento",
            voteCodeBatches: [],
            votingRound: null,
          }),
        },
      ],
      { initialEntries: ["/administracion/gran-final?lista=auditoria"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await waitFor(() => Boolean(document.querySelector('[role="tab"]')));
  }

  async function chooseCreate() {
    await openRadixSelect(findButton("Acciones", { exact: true }));
    await updateReactDomForm(() => {
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "Crear acceso de auditoría")
        ?.click();
    });
  }

  async function create(label: string) {
    await chooseCreate();
    const input = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[name="label"]',
    );

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, label);
      }
    });
    await clickReactDomButton("Crear", { exact: true });
  }

  test("creates a link for the auditor named and hands it over once", async () => {
    await mount();

    await create("Ana");

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "create-audit-link",
      label: "Ana",
    });
    await waitFor(() =>
      Boolean(
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Enlace del acceso de auditoría"]',
        )?.value,
      ),
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(
      dialog?.querySelector<HTMLInputElement>(
        'input[aria-label="Enlace del acceso de auditoría"]',
      )?.value,
    ).toBe("https://sistema.enescena.com.ar/auditoria#token-del-enlace");
    expect(
      dialog
        ?.querySelector('img[alt="Código QR del acceso de auditoría de Ana"]')
        ?.getAttribute("src"),
    ).toBe(createdAnswer.auditLink?.qrDataUri);
  });

  test("keeps handing over the third link once the list reaches the limit", async () => {
    blockReasonsAfterAction = [
      { code: "limit-reached", label: auditLinkLimitMessage },
    ];
    await mount();

    await create("Ana");

    await waitFor(() =>
      Boolean(
        document.querySelector(
          'img[alt="Código QR del acceso de auditoría de Ana"]',
        ),
      ),
    );
    // Long enough for the list's revalidation to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[aria-label="Enlace del acceso de auditoría"]',
      )?.value,
    ).toBe("https://sistema.enescena.com.ar/auditoria#token-del-enlace");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  test("tells a refused creation in a toast and keeps the form", async () => {
    answer = {
      message:
        "Ya hay 3 accesos de auditoría vigentes. Revocá uno para crear otro.",
      status: "error",
    };
    await mount();

    await create("Ana");

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "Ya hay 3 accesos de auditoría vigentes. Revocá uno para crear otro.",
      expect.anything(),
    );
    expect(
      document.querySelector('[role="dialog"] input[name="label"]'),
    ).not.toBeNull();
  });

  test("opens why no other link can be created at the limit, and sends nothing", async () => {
    await mount([
      {
        code: "limit-reached",
        label: auditLinkLimitMessage,
      },
    ]);

    await chooseCreate();

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain(
      "Ya hay 3 accesos de auditoría vigentes. Revocá uno para crear otro.",
    );
    expect(submitted).toHaveLength(0);
  });

  async function openLinkOf(label: string) {
    const row = [...document.querySelectorAll("tbody tr")].find((item) =>
      item.textContent?.includes(label),
    );

    await clickReactDomButton(label, { exact: true, within: row });
  }

  test("shows a live link again from its auditor's name", async () => {
    await mount();

    await openLinkOf("Marta");

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "show-audit-link",
      linkId: "acceso-marta",
    });
    await waitFor(() =>
      Boolean(
        document.querySelector<HTMLInputElement>(
          '[role="dialog"] input[aria-label="Enlace del acceso de auditoría"]',
        )?.value,
      ),
    );
    expect(
      document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[aria-label="Enlace del acceso de auditoría"]',
      )?.value,
    ).toBe("https://sistema.enescena.com.ar/auditoria#token-de-marta");
  });

  test("closes the dialog over a link refused since the list loaded, and says why", async () => {
    showAnswer = {
      message:
        "Ese acceso de auditoría fue revocado y ya no se puede abrir. Creá uno nuevo.",
      status: "error",
    };
    await mount();

    await openLinkOf("Marta");

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "Ese acceso de auditoría fue revocado y ya no se puede abrir. Creá uno nuevo.",
      expect.anything(),
    );
    await waitFor(() => document.querySelector('[role="dialog"]') === null);
  });

  test("revokes a link from its dialog once the confirmation names the auditor", async () => {
    answer = { message: "Revocaste el acceso.", status: "success" };
    await mount();

    await openLinkOf("Marta");
    await waitFor(() =>
      Boolean(
        findButton("Revocar", {
          exact: true,
          within: document.querySelector('[role="dialog"]'),
        }),
      ),
    );
    await clickReactDomButton("Revocar", {
      exact: true,
      within: document.querySelector('[role="dialog"]'),
    });

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("¿Revocar el acceso de Marta?");

    await clickReactDomButton("Revocar", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submitted.length === 2);
    expect(Object.fromEntries(submitted[1])).toEqual({
      intent: "revoke-audit-link",
      linkId: "acceso-marta",
    });
  });

  test("tells a refused revoke in a toast", async () => {
    answer = {
      message: "Ese acceso de auditoría ya estaba revocado.",
      status: "error",
    };
    await mount();

    await openLinkOf("Marta");
    await waitFor(() =>
      Boolean(
        findButton("Revocar", {
          exact: true,
          within: document.querySelector('[role="dialog"]'),
        }),
      ),
    );
    await clickReactDomButton("Revocar", {
      exact: true,
      within: document.querySelector('[role="dialog"]'),
    });
    await clickReactDomButton("Revocar", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith(
      "Ese acceso de auditoría ya estaba revocado.",
      expect.anything(),
    );
  });

  test("opens why a revoked link cannot be shown again, and sends nothing", async () => {
    await mount();

    await openLinkOf("Jorge");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("El acceso de Jorge ya fue revocado el 21 de octubre de 2026.");
    expect(submitted).toHaveLength(0);
  });
});
