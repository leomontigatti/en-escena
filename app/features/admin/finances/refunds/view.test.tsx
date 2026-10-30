/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { RefundDetailActionData } from "./shared";
import { RefundDetailRouteView } from "./view";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
  window.history.replaceState(null, "", "/");
});

type LoaderData = Parameters<typeof RefundDetailRouteView>[0]["loaderData"];

const refundPath = "/administracion/movimientos/reembolsos/refund_1";

function loaderDataFixture(overrides: Partial<LoaderData> = {}): LoaderData {
  return {
    canWrite: true,
    refund: {
      academyId: "academy_1",
      academyName: "Academia Norte",
      amount: 1000,
      eventId: "event_1",
      id: "refund_1",
      internalNote: null,
      reference: null,
      refundDate: "2026-04-03",
      refundMethod: "efectivo",
      refundNumber: 1,
      updatedAt: new Date("2026-04-03T12:00:00.000Z"),
    },
    selectedEventId: "event_1",
    values: {
      academyId: "academy_1",
      amount: "1000",
      internalNote: "",
      paymentDate: "2026-04-03",
      paymentMethod: "efectivo",
      reference: "",
    },
    version: "2026-04-03T12:00:00.000Z",
    ...overrides,
  };
}

type ServerAnswer = {
  actionData?: RefundDetailActionData;
  loaderData?: LoaderData;
};

/** Renders the page, returning how to hand it what the server would answer. */
async function renderPage(submissions: FormData[] = []) {
  // The form posts to the URL the document says, which the memory router does
  // not set.
  window.history.replaceState(null, "", refundPath);

  let setState = (_: ServerAnswer) => {};

  function PageWithServerAnswers() {
    const [state, setAnswer] = useState<{
      actionData?: RefundDetailActionData;
      loaderData: LoaderData;
    }>({ loaderData: loaderDataFixture() });
    setState = (next) => setAnswer((current) => ({ ...current, ...next }));

    return <RefundDetailRouteView {...state} />;
  }

  const router = createMemoryRouter(
    [
      {
        action: async ({ request }) => {
          submissions.push(await request.formData());

          return null;
        },
        element: <PageWithServerAnswers />,
        path: refundPath,
      },
    ],
    { initialEntries: [refundPath] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return {
    serverAnswers: async (answer: ServerAnswer) => {
      await act(async () => setState(answer));
    },
  };
}

function readAmount() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="amount"]',
  );

  if (!input) {
    throw new Error("Expected the amount input.");
  }

  return input;
}

async function typeAmount(value: string) {
  await updateReactDomForm(() => setInputValue(readAmount(), value));
}

const overCapRefusal = (amount: string): RefundDetailActionData => ({
  fieldErrors: {},
  intent: "update-refund",
  message: "El reembolso no puede superar $ 3.000.",
  status: "error",
  values: { ...loaderDataFixture().values, amount },
});

const changedMeanwhile: RefundDetailActionData = {
  fieldErrors: {},
  intent: "update-refund",
  message: "El reembolso cambió mientras se guardaba.",
  status: "error",
};

const newerVersion = "2026-04-03T13:00:00.000Z";

describe("the refund form", () => {
  test("saves against the version it was read at", async () => {
    const submissions: FormData[] = [];
    await renderPage(submissions);

    await typeAmount("900");
    await clickReactDomButton("Guardar", { exact: true });
    await waitFor(() => submissions.length === 1);

    expect(submissions[0]?.get("intent")).toBe("update-refund");
    expect(submissions[0]?.get("version")).toBe("2026-04-03T12:00:00.000Z");
    expect(submissions[0]?.get("amount")).toBe("900");
  });

  test("keeps what was typed after a refused save", async () => {
    const page = await renderPage();

    await typeAmount("9000");
    await page.serverAnswers({ actionData: overCapRefusal("9000") });

    expect(readAmount().value).toBe("9000");
  });

  test("keeps what was typed when a save crashes after a refusal", async () => {
    const page = await renderPage();

    await typeAmount("9000");
    await page.serverAnswers({ actionData: overCapRefusal("9000") });
    await page.serverAnswers({
      // A crash answers with a message alone (`recoverableClientAction`).
      actionData: {
        message: "Algo salió mal.",
        status: "error",
      } as RefundDetailActionData,
    });

    expect(readAmount().value).toBe("9000");
  });

  test("shows what was saved after a refusal followed by a good save", async () => {
    const page = await renderPage();

    await typeAmount("9000");
    await page.serverAnswers({ actionData: overCapRefusal("9000") });
    await page.serverAnswers({
      actionData: {
        intent: "update-refund",
        message: "Reembolso guardado.",
        status: "success",
      },
      loaderData: loaderDataFixture({
        values: { ...loaderDataFixture().values, amount: "1500" },
        version: newerVersion,
      }),
    });

    expect(readAmount().value).toBe("1500");
  });

  test("takes the fresh values and version when the refund changed meanwhile, so a retry cannot overwrite them", async () => {
    const page = await renderPage();

    await typeAmount("500");
    await page.serverAnswers({
      actionData: changedMeanwhile,
      loaderData: loaderDataFixture({
        values: { ...loaderDataFixture().values, amount: "900" },
        version: newerVersion,
      }),
    });

    expect(readAmount().value).toBe("900");
    expect(
      document.querySelector<HTMLInputElement>('input[name="version"]')?.value,
    ).toBe(newerVersion);
  });

  test("drops what was typed even when the refund changed in nothing the form shows", async () => {
    const page = await renderPage();

    await typeAmount("500");
    await page.serverAnswers({
      actionData: changedMeanwhile,
      loaderData: loaderDataFixture({ version: newerVersion }),
    });

    expect(readAmount().value).toBe("1000");
  });
});
