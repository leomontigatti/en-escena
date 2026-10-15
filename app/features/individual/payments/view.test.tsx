/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { loadIndividualPayments } from "./server";
import { IndividualPaymentsView } from "./view";

type LoaderData = Awaited<ReturnType<typeof loadIndividualPayments>>;
type ActiveEventLoaderData = Exclude<LoaderData, { activeEvent: null }>;

describe("IndividualPaymentsView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("shows the event's payment instructions only when the event has them", async () => {
    await render({
      ...loaderDataFixture(),
      paymentInstructions: {
        alias: "mi.alias-01",
        bankName: null,
        cbu: null,
        holderCuit: null,
        holderName: null,
        text: null,
      },
    });

    expect(
      document.querySelector('[data-slot="alert"]')?.textContent,
    ).toContain("mi.alias-01");

    renderer.cleanup();
    await render(loaderDataFixture());

    expect(document.querySelector('[data-slot="alert"]')).toBeNull();
  });

  async function render(loaderData: LoaderData) {
    await renderer.renderAsync(
      renderInDataRouter(
        "/particular/pagos",
        <IndividualPaymentsView loaderData={loaderData} />,
      ),
    );
  }
});

function loaderDataFixture(): ActiveEventLoaderData {
  return {
    activeEvent: {
      id: "event_1",
      name: "Regional 2026",
    } as ActiveEventLoaderData["activeEvent"],
    paymentInstructions: null,
    payments: [],
  };
}
