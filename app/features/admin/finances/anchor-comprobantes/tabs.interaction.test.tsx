// @vitest-environment jsdom

import { act } from "react";
import { useLocation } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { AnchorComprobanteRow } from "./server";
import { FinancialDetailTabs } from "./tabs";

describe("FinancialDetailTabs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("opens on the inscriptions and counts the comprobantes on the second tab", () => {
    renderTabs([invoice(), creditNote()]);

    expect(tabLabels()).toEqual(["Inscripciones", "Comprobantes (2)"]);
    expect(document.body.textContent).toContain("La tabla de inscripciones");
  });

  test("lists each comprobante by number, type, date and amount, a credit note negative", async () => {
    renderTabs([creditNote(), invoice()]);

    await selectTab("Comprobantes (2)");

    expect(rows()).toEqual([
      ["0001-00000002", "NC", "23/07/2026", "-$ 3.000"],
      ["0001-00000007", "FC", "22/07/2026", "$ 3.000"],
    ]);
    expect(
      document.querySelector(
        'tbody a[href="/administracion/comprobantes/fc_1"]',
      )?.textContent,
    ).toBe("0001-00000007");
    // No status column and no table chrome: the list is short by nature.
    expect(document.body.textContent).not.toContain("Anulada");
    expect(
      document.querySelector('input[aria-label="Buscar en la tabla"]'),
    ).toBeNull();
  });

  test("tells a unit with no comprobante where emission starts", async () => {
    renderTabs([]);

    expect(tabLabels()).toEqual(["Inscripciones", "Comprobantes (0)"]);

    await selectTab("Comprobantes (0)");

    expect(document.querySelector('[data-slot="empty"]')).not.toBeNull();
    expect(document.querySelector("table")).toBeNull();
  });

  // Both tables read the page from the same address bar, and this one has no
  // pages: opening it must not reset the inscriptions' page to the first.
  test("keeps the inscriptions table's page when the comprobantes tab opens", async () => {
    renderTabs([invoice()], "?pagina=2");

    await selectTab("Comprobantes (1)");

    expect(document.querySelector("[data-location]")?.textContent).toBe(
      "?pagina=2",
    );
  });

  function renderTabs(comprobantes: AnchorComprobanteRow[], search = "") {
    renderer.render(
      renderInDataRouter(
        `/administracion/finanzas/academia_1/coreografias/coreografia_1${search}`,
        <>
          <FinancialDetailTabs
            comprobantes={comprobantes}
            inscriptions={<p>La tabla de inscripciones</p>}
          />
          <LocationProbe />
        </>,
      ),
    );
  }
});

function LocationProbe() {
  return <output data-location>{useLocation().search}</output>;
}

function invoice(): AnchorComprobanteRow {
  return {
    id: "fc_1",
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: 7,
    cbteFch: "20260722",
    impTotal: 3000,
  };
}

function creditNote(): AnchorComprobanteRow {
  return {
    id: "nc_1",
    cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: 2,
    cbteFch: "20260723",
    impTotal: 3000,
  };
}

function tabLabels() {
  return [...document.querySelectorAll('[role="tab"]')].map(
    (tab) => tab.textContent,
  );
}

function rows() {
  return [...document.querySelectorAll("tbody tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) =>
      cell.textContent?.replace(/\s/g, " ").trim(),
    ),
  );
}

/** Radix tabs activate on `mousedown`, not on `click`. */
async function selectTab(label: string) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (element) => element.textContent === label,
  );

  await act(async () => {
    tab!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
  });
}
