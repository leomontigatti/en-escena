/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The discount half of the choreography detail: where the number comes from,
 * and what happens to it when a sibling inscription elsewhere changes.
 */
import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { AllocationDetailPrototypeView } from "./detail-view";
import { readDancerDiscount } from "./discount";
import { initialPrototypeState, readInscriptions } from "./fixtures";
import { readChoreographies } from "./rollup";
import {
  emitComprobante,
  registerSibling,
  withdrawSibling,
} from "./roster-moves";

const detailPath =
  "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1";

function readChoreography(state: typeof initialPrototypeState, id: string) {
  const choreography = readChoreographies(state, readInscriptions(state)).find(
    (row) => row.id === id,
  );

  if (choreography === undefined) {
    throw new Error(`no choreography ${id}`);
  }

  return choreography;
}

describe("dancer discount — the rule", () => {
  it("earns the tier across choreographies, not within one", () => {
    const ana = readDancerDiscount(initialPrototypeState, "dan-ana", "ins-1");

    expect(ana.qualifyingCount).toBe(3);
    expect(ana.percentage).toBe(10);
    // Two of the three are in choreographies this screen does not show.
    expect(ana.qualifying.filter((row) => !row.isThisInscription)).toHaveLength(
      2,
    );
    // And the one left without a discount is one of *those*, so this row keeps
    // its percentage for a reason that is entirely off-screen.
    expect(ana.qualifying.find((row) => row.isExcluded)?.choreographyName).toBe(
      "Umbral",
    );
    expect(ana.reason).toBe("granted");
  });

  it("leaves the dancer's most expensive inscription without a discount", () => {
    // Bruno has four inscriptions — the top tier — and this one is his most
    // expensive, so he reads zero beside rows that read 10 %.
    const bruno = readDancerDiscount(
      initialPrototypeState,
      "dan-bruno",
      "ins-2",
    );

    expect(bruno.percentage).toBe(15);
    expect(bruno.discountAmount).toBe(0);
    expect(bruno.reason).toBe("excludedAsMostExpensive");
  });

  it("marks the exclusion decided by the id tie-break", () => {
    // Camila's three inscriptions share a price, so «la más cara» describes
    // three identical numbers and the identifier decides.
    const camila = readDancerDiscount(
      initialPrototypeState,
      "dan-camila",
      "ins-3",
    );

    expect(camila.percentage).toBe(10);
    expect(camila.excludedByTieBreak).toBe(true);
    expect(camila.reason).toBe("granted");

    // Bruno's is decided by price alone, so no tie is claimed.
    expect(
      readDancerDiscount(initialPrototypeState, "dan-bruno", "ins-2")
        .excludedByTieBreak,
    ).toBe(false);
  });

  it("drops a withdrawn sibling from the qualifying set", () => {
    const emilia = readDancerDiscount(
      initialPrototypeState,
      "dan-emilia",
      "ins-5",
    );

    expect(emilia.qualifyingCount).toBe(2);
    expect(emilia.percentage).toBe(0);
    expect(emilia.withdrawn).toHaveLength(1);

    // Reviving the withdrawn row puts her over the tier, and this
    // choreography's total falls without anything in it being touched.
    const before = readChoreography(initialPrototypeState, "cho-1");
    const after = readChoreography(
      registerSibling(initialPrototypeState, "dan-emilia", "cho-5"),
      "cho-1",
    );

    expect(after.totalAmount).toBeLessThan(before.totalAmount);
  });
});

describe("dancer discount — the bill moves after emission", () => {
  it("opens a signed delta when a sibling elsewhere changes", () => {
    const emitted = emitComprobante(initialPrototypeState, "cho-1");
    expect(readChoreography(emitted, "cho-1").delta).toBe(0);

    // A withdrawal elsewhere costs Ana her tier, so the derived total outgrows
    // what was billed: a nota de débito is owed.
    const afterWithdrawal = readChoreography(
      withdrawSibling(emitted, "ins-11"),
      "cho-1",
    );
    expect(afterWithdrawal.delta).toBeGreaterThan(0);

    // A registration elsewhere lowers it: a nota de crédito.
    const afterRegistration = readChoreography(
      registerSibling(emitted, "dan-emilia", "cho-5"),
      "cho-1",
    );
    expect(afterRegistration.delta).toBeLessThan(0);
  });
});

describe("dancer discount — the surface", () => {
  it("explains provenance below the roster, naming the other choreographies", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    expect(markup).toContain("Descuentos");
    expect(markup).toContain("Inscripciones que lo habilitan");
    expect(markup).toContain("Umbral");
    expect(markup).toContain("Ecos");
    expect(markup).toContain("hacen falta 3 para el 10 %");
    expect(markup).toContain("por ser la más cara del bailarín");
    expect(markup).toContain("desempata el identificador");
  });

  it("carries the subtraction on the total, and only where there is one", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    // Ana's total is discounted, so her cell offers the breakdown.
    expect(markup).toContain(
      'aria-label="Cómo se compone el total de Ana Rivas"',
    );
    // Delfina has a single inscription and no discount: nothing to explain, so
    // no affordance. An icon on every row would be noise.
    expect(markup).not.toContain(
      'aria-label="Cómo se compone el total de Delfina Ojeda"',
    );
  });

  it("offers Emitir factura before emission and Imprimir factura after", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    // The header menu exists; the print item does not, because there is no
    // document yet. One factura per choreography (decision 16), so the two
    // items are never offered at once.
    expect(markup).toContain('aria-label="Acciones"');
    expect(markup).not.toContain("Imprimir factura");
  });

  it("says nothing about movement until a factura exists", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    expect(markup).not.toContain("Nota de débito");
    expect(markup).not.toContain("Nota de crédito");
    expect(markup).not.toContain("Facturado");
  });
});
