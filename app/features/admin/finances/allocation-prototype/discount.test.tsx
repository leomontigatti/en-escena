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
  emitAmendment,
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

  it("settles a tie between identical prices without saying how", () => {
    // Camila's three inscriptions share a price, so «la más cara» describes
    // three identical numbers. Exactly one is excluded, deterministically, and
    // the amount is the same whichever one wins — so the tie-break is never
    // stated on screen.
    const camila = readDancerDiscount(
      initialPrototypeState,
      "dan-camila",
      "ins-3",
    );

    expect(camila.percentage).toBe(10);
    expect(camila.qualifying.filter((row) => row.isExcluded)).toHaveLength(1);
    expect(camila.reason).toBe("granted");
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

  it("closes the delta with the document its sign names", () => {
    const emitted = emitComprobante(initialPrototypeState, "cho-1");
    const moved = withdrawSibling(emitted, "ins-11");
    const amended = emitAmendment(moved, "cho-1");
    const choreography = readChoreography(amended, "cho-1");

    // The bill rose, so it is a débito — never a choice between the two.
    expect(choreography.comprobante?.amendments).toHaveLength(1);
    expect(choreography.comprobante?.amendments[0].label).toContain(
      "Nota de débito",
    );
    // And the papers together now say what is derived: nothing is owed.
    expect(choreography.delta).toBe(0);
  });
});

describe("a withdrawn inscription", () => {
  it("stays readable when it holds money, at zero and marked Retirada", () => {
    // Nadia's row in «Reflejos» was given de baja with an allocation on it.
    const row = readInscriptions(initialPrototypeState).find(
      (inscription) => inscription.id === "ins-18",
    );

    expect(row?.withdrawnAt).not.toBe(null);
    expect(row?.totalAmount).toBe(0);
    expect(row?.owedBalanceAmount).toBe(0);
    // The money is the reason the row exists (#600).
    expect(row?.allocatedAmount).toBeGreaterThan(0);

    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );
    expect(markup).toContain("Nadia Coria");
    expect(markup).toContain("Retirada");
  });

  it("disappears entirely when there was no money on it", () => {
    // Ana's «Ecos» row has neither allocations nor an invoice line, so removal
    // deletes instead of withdrawing: there is nothing to preserve.
    const after = withdrawSibling(initialPrototypeState, "ins-11");

    expect(
      after.inscriptions.some((inscription) => inscription.id === "ins-11"),
    ).toBe(false);
  });
});

describe("dancer discount — the surface", () => {
  it("carries no provenance section: the tooltip is the whole explanation", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    // The `Descuentos` section was removed. What it answered — *why that
    // percentage*, in terms of inscriptions in other choreographies — is not
    // answered anywhere on this screen any more; the row explains only *how
    // much*, and it explains it in full.
    expect(markup).not.toContain("Descuentos");
    expect(markup).not.toContain("Inscripciones que lo habilitan");
    expect(markup).not.toContain("hacen falta 3 para el 10 %");
    expect(markup).not.toContain("por ser la más cara del bailarín");
  });

  it("carries the subtraction on the total, and only where there is one", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      detailPath,
    );

    // Ana's total is discounted, so her cell offers the breakdown — as text,
    // not as a button: hovering the figure is the whole gesture.
    expect(markup).toContain(
      'aria-label="Cómo se compone el total de Ana Rivas"',
    );
    expect(markup).not.toContain(
      '<button aria-label="Cómo se compone el total de Ana Rivas"',
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

  it("keeps the whole roster above its deposit, so emission is reachable", () => {
    // Decision 15 gates emission on `Señada`, read as the **minimum** across the
    // roster (#551): one dancer short of her deposit and the prototype can never
    // demonstrate the document, or anything that follows it.
    const choreography = readChoreography(initialPrototypeState, "cho-1");

    expect(choreography.status).not.toBe("depositPending");
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
