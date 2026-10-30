/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import type { RefundDetailActionData } from "./shared";
import { RefundDetailRouteView } from "./view";

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

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

let answer = (_: {
  actionData?: RefundDetailActionData;
  loaderData?: LoaderData;
}) => {};

async function renderPage(
  initial: LoaderData = loaderDataFixture(),
  submissions: FormData[] = [],
) {
  window.history.replaceState(null, "", refundPath);

  function Page() {
    const [state, setState] = useState<{
      actionData?: RefundDetailActionData;
      loaderData: LoaderData;
    }>({ loaderData: initial });
    answer = (next) => setState((current) => ({ ...current, ...next }));

    return <RefundDetailRouteView {...state} />;
  }

  const router = createMemoryRouter(
    [
      {
        action: async ({ request }) => {
          submissions.push(await request.formData());

          return null;
        },
        element: <Page />,
        path: refundPath,
      },
    ],
    { initialEntries: [refundPath] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
  await settle();
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

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("the refund form", () => {
  test("saves against the version it was read at", async () => {
    const submissions: FormData[] = [];
    await renderPage(loaderDataFixture(), submissions);

    await updateReactDomForm(() => setInputValue(readAmount(), "900"));
    await clickReactDomButton("Guardar", { exact: true });
    await settle();

    expect(submissions[0]?.get("intent")).toBe("update-refund");
    expect(submissions[0]?.get("version")).toBe("2026-04-03T12:00:00.000Z");
    expect(submissions[0]?.get("amount")).toBe("900");
  });

  test("keeps what was typed after a refused save", async () => {
    await renderPage();

    await updateReactDomForm(() => setInputValue(readAmount(), "9000"));
    await act(async () => {
      answer({
        actionData: {
          fieldErrors: {},
          intent: "update-refund",
          message: "El reembolso no puede superar $ 3.000.",
          status: "error",
          values: { ...loaderDataFixture().values, amount: "9000" },
        },
      });
    });
    await settle();

    expect(readAmount().value).toBe("9000");
  });

  test("shows what was saved after a refusal followed by a good save", async () => {
    await renderPage();

    await updateReactDomForm(() => setInputValue(readAmount(), "9000"));
    await act(async () => {
      answer({
        actionData: {
          fieldErrors: {},
          intent: "update-refund",
          message: "El reembolso no puede superar $ 3.000.",
          status: "error",
          values: { ...loaderDataFixture().values, amount: "9000" },
        },
      });
    });
    await settle();
    await act(async () => {
      answer({
        actionData: {
          intent: "update-refund",
          message: "Reembolso guardado.",
          status: "success",
        },
        loaderData: loaderDataFixture({
          values: { ...loaderDataFixture().values, amount: "1500" },
          version: "2026-04-03T13:00:00.000Z",
        }),
      });
    });
    await settle();

    expect(readAmount().value).toBe("1500");
  });

  test("takes the fresh values and version when the refund changed meanwhile, so a retry cannot overwrite them", async () => {
    const submissions: FormData[] = [];
    await renderPage(loaderDataFixture(), submissions);

    await updateReactDomForm(() => setInputValue(readAmount(), "500"));
    await act(async () => {
      answer({
        actionData: {
          fieldErrors: {},
          intent: "update-refund",
          message: "El reembolso cambió mientras se guardaba.",
          status: "error",
        },
        loaderData: loaderDataFixture({
          values: { ...loaderDataFixture().values, amount: "900" },
          version: "2026-04-03T13:00:00.000Z",
        }),
      });
    });
    await settle();

    expect(readAmount().value).toBe("900");
    expect(
      document.querySelector<HTMLInputElement>('input[name="version"]')?.value,
    ).toBe("2026-04-03T13:00:00.000Z");
  });

  test("gives the auditor nothing to save or delete", async () => {
    await renderPage(loaderDataFixture({ canWrite: false }));

    expect(document.querySelector('input[name="amount"]')).toBeNull();
    expect(findButton("Guardar", { exact: true })).toBeUndefined();
    expect(findButton("Acciones", { exact: true })).toBeUndefined();
  });
});
