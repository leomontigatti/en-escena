/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The emitted document and everything that hangs off it: the factura's own
 * screen, its status, the notas that adjust it, and the one row a factura can
 * fail to name.
 */
import { afterEach, describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { ComprobantePrototypeView } from "./comprobante-view";
import { AllocationDetailPrototypeView } from "./detail-view";
import { initialPrototypeState, readInscriptions } from "./fixtures";
import { readChoreographies } from "./rollup";
import {
  emitAmendment,
  emitComprobante,
  registerSibling,
} from "./roster-moves";
import { resetPrototypeState, setPrototypeState } from "./store";

const detailPath =
  "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1";
const comprobantePath =
  "/administracion/finanzas/prototipo-asignacion/comprobante?coreografia=cho-1";

function readChoreography(state: typeof initialPrototypeState, id: string) {
  const choreography = readChoreographies(state, readInscriptions(state)).find(
    (row) => row.id === id,
  );

  if (choreography === undefined) {
    throw new Error(`no choreography ${id}`);
  }

  return choreography;
}

afterEach(() => {
  resetPrototypeState();
});

describe("the emitted factura", () => {
  it("is reachable from the choreography, and only once it exists", () => {
    expect(
      renderRouteView(<AllocationDetailPrototypeView />, detailPath),
    ).not.toContain("Ver factura");

    setPrototypeState(emitComprobante(initialPrototypeState, "cho-1"));
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    // Both halves of decision 14's `Facturada` axis at choreography level: the
    // document is named on the screen, not only inside the actions menu.
    expect(markup).toContain("Ver factura");
    expect(markup).toContain("Factura C 0003-00000412");
    expect(markup).toContain("Vigente");
  });

  it("bills one line per inscription, and the lines sum to the total exactly", () => {
    const emitted = emitComprobante(initialPrototypeState, "cho-1");
    setPrototypeState(emitted);

    const choreography = readChoreography(emitted, "cho-1");
    const markup = renderRouteView(
      <ComprobantePrototypeView />,
      comprobantePath,
    );

    expect(choreography.comprobante?.lines).toHaveLength(
      choreography.inscriptions.length,
    );
    // The invariant behind the arithmetic: each line is one inscription's
    // rounded net amount and the total only ever **adds them up**. Nothing
    // re-applies the percentage to a sum, which is the only way the authorised
    // total and its detail could end up a peso apart.
    expect(choreography.documentedTotal).toBe(choreography.totalAmount);
    expect(markup).toContain("Inscripción — Ana Rivas");
    expect(markup).toContain("Importe total");
  });

  it("keeps the withdrawn inscription it names on the detail", () => {
    // #600's fourth evidence-showing surface (#554): filtering the row would
    // stop the detail summing to the authorised total.
    setPrototypeState(emitComprobante(initialPrototypeState, "cho-1"));

    expect(
      renderRouteView(<ComprobantePrototypeView />, comprobantePath),
    ).toContain("Inscripción — Nadia Coria");
  });
});

describe("the nota de crédito", () => {
  it("adjusts the factura, which lists it and stops being Vigente", () => {
    const emitted = emitComprobante(initialPrototypeState, "cho-1");
    // Emilia's sibling registration elsewhere lifts her to the tier, so this
    // bill **falls** and the document owes a crédito.
    const moved = registerSibling(emitted, "dan-emilia", "cho-5");
    expect(readChoreography(moved, "cho-1").delta).toBeLessThan(0);

    const amended = emitAmendment(moved, "cho-1");
    setPrototypeState(amended);
    const markup = renderRouteView(
      <ComprobantePrototypeView />,
      comprobantePath,
    );

    expect(markup).toContain("Nota de crédito");
    expect(markup).toContain("Ajustes");
    // #599: the status belongs to the factura and only to it.
    expect(markup).toContain("Ajustada");
    expect(markup).not.toContain("Vigente");
  });

  it("leaves nothing owed once emitted", () => {
    const emitted = emitComprobante(initialPrototypeState, "cho-1");
    const amended = emitAmendment(
      registerSibling(emitted, "dan-emilia", "cho-5"),
      "cho-1",
    );
    setPrototypeState(amended);

    expect(readChoreography(amended, "cho-1").delta).toBe(0);
    expect(
      renderRouteView(<AllocationDetailPrototypeView />, detailPath),
    ).not.toContain("Falta emitir");
  });
});

describe("an inscription the factura does not name", () => {
  it("reads Sin facturar, which is how the Facturada axis renders", () => {
    const emitted = emitComprobante(initialPrototypeState, "cho-1");
    // Registered after the document was emitted, so it is on no factura.
    setPrototypeState(registerSibling(emitted, "dan-julian", "cho-1"));

    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );
    const row = markup.slice(
      markup.indexOf("Julián Mora"),
      markup.indexOf("</tr>", markup.indexOf("Julián Mora")),
    );

    expect(row).toContain("Sin facturar");
  });

  it("says nothing at all before a factura exists", () => {
    expect(
      renderRouteView(<AllocationDetailPrototypeView />, detailPath),
    ).not.toContain("Sin facturar");
  });
});
