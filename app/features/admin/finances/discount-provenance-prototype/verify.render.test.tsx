import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import {
  emitComprobante,
  initialPrototypeState,
  readChoreography,
  readDancerDiscount,
  registerSibling,
  withdrawSibling,
} from "./fixtures";
import { DiscountProvenancePrototypeView } from "./view";

const path = "/administracion/finanzas/prototipo-descuentos";

describe("discount provenance prototype — the rule", () => {
  it("earns the tier across choreographies, not within one", () => {
    // Ana is in three choreographies of this academy and event; only one of
    // them is the one on screen.
    const ana = readDancerDiscount(
      initialPrototypeState,
      "dan-ana",
      "ins-ana-reflejos",
    );

    expect(ana.qualifyingCount).toBe(3);
    expect(ana.percentage).toBe(10);
    expect(
      ana.qualifying.filter((row) => !row.isFocusChoreography),
    ).toHaveLength(2);
  });

  it("leaves the dancer's most expensive inscription without a discount", () => {
    // Bruno's most expensive is his solo, in another choreography, so the one
    // on screen keeps its 15%.
    const bruno = readDancerDiscount(
      initialPrototypeState,
      "dan-bruno",
      "ins-bruno-reflejos",
    );

    expect(bruno.percentage).toBe(15);
    expect(bruno.reason).toBe("granted");
    expect(
      bruno.qualifying.find((row) => row.isExcluded)?.choreographyName,
    ).toBe("Vértigo");

    // Gala's is *this* one, so she reads zero beside identical rows.
    const gala = readDancerDiscount(
      initialPrototypeState,
      "dan-gala",
      "ins-gala-reflejos",
    );

    expect(gala.percentage).toBe(10);
    expect(gala.discountAmount).toBe(0);
    expect(gala.reason).toBe("excludedAsMostExpensive");
  });

  it("marks the exclusion decided by the id tie-break", () => {
    // Hernán ties «Reflejos» with «Contemporáneo juvenil» at the same price
    // row, so «la más cara» describes two identical numbers.
    const hernan = readDancerDiscount(
      initialPrototypeState,
      "dan-hernan",
      "ins-hernan-reflejos",
    );

    expect(hernan.excludedByTieBreak).toBe(true);
    expect(hernan.excludedChoreographyName).toBe("Contemporáneo juvenil");
    expect(hernan.reason).toBe("granted");

    // Gala's exclusion is decided by price alone, so no tie is claimed.
    const gala = readDancerDiscount(
      initialPrototypeState,
      "dan-gala",
      "ins-gala-reflejos",
    );

    expect(gala.excludedByTieBreak).toBe(false);
  });

  it("drops a withdrawn sibling from the qualifying set", () => {
    const emilia = readDancerDiscount(
      initialPrototypeState,
      "dan-emilia",
      "ins-emilia-reflejos",
    );

    expect(emilia.qualifyingCount).toBe(2);
    expect(emilia.percentage).toBe(0);
    expect(emilia.withdrawn).toHaveLength(1);
  });

  it("moves this choreography's bill when a sibling elsewhere changes", () => {
    const before = readChoreography(initialPrototypeState);
    const after = readChoreography(
      registerSibling(initialPrototypeState, "dan-ana", "cho-vertigo"),
    );

    // Ana's fourth inscription raises her tier, so a total in *this*
    // choreography falls without anything in it being touched.
    expect(after.derivedTotal).toBeLessThan(before.derivedTotal);
  });

  it("turns a post-emission movement into a signed delta", () => {
    const emitted = emitComprobante(initialPrototypeState);
    expect(readChoreography(emitted).delta).toBe(0);

    // A withdrawal elsewhere raises Bruno's total here: the derived total
    // outgrows what was billed, so a nota de débito is owed.
    const afterWithdrawal = readChoreography(
      withdrawSibling(emitted, "ins-bruno-vertigo"),
    );
    expect(afterWithdrawal.delta).toBeGreaterThan(0);

    // A registration elsewhere lowers it: a nota de crédito.
    const afterRegistration = readChoreography(
      registerSibling(emitted, "dan-ana", "cho-vertigo"),
    );
    expect(afterRegistration.delta).toBeLessThan(0);
  });
});

describe("discount provenance prototype — the surfaces", () => {
  it("A explains composition below the roster and nothing else", () => {
    const markup = renderRouteView(
      <DiscountProvenancePrototypeView />,
      `${path}?variant=A`,
    );

    expect(markup).not.toContain("Elegí un evento activo");
    expect(markup).toContain("Descuentos");
    expect(markup).toContain("Inscripciones que lo habilitan");
    // The provenance names the other choreographies, which is the whole point.
    expect(markup).toContain("Contemporáneo juvenil");
    expect(markup).toContain("Umbral");
    // No movement vocabulary: nothing has been emitted, and A never compares.
    expect(markup).not.toContain("Nota de débito");
    expect(markup).not.toContain("Facturado</th>");
  });

  it("B is A until a factura exists, and says so", () => {
    const markup = renderRouteView(
      <DiscountProvenancePrototypeView />,
      `${path}?variant=B`,
    );

    expect(markup).toContain("Todavía no se emitió la factura");
  });

  it("C drops the section and puts the detail in the row", () => {
    const markup = renderRouteView(
      <DiscountProvenancePrototypeView />,
      `${path}?variant=C`,
    );

    expect(markup).toContain("En esta variante no hay sección");
    expect(markup).not.toContain("Inscripciones que lo habilitan");
  });

  it("keeps #618's column styling: muted context, never a per-row grey", () => {
    const markup = renderRouteView(
      <DiscountProvenancePrototypeView />,
      `${path}?variant=A`,
    );

    // `Precio base` is muted for the whole column and `Saldo adeudado` is
    // emphasised; no cell is muted on account of its own value.
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).not.toContain('<span class="text-muted-foreground">$');
  });

  it("shows every dancer, including the ones with no discount", () => {
    const markup = renderRouteView(
      <DiscountProvenancePrototypeView />,
      `${path}?variant=A`,
    );

    for (const dancer of [
      "Ana Rivas",
      "Bruno Salas",
      "Camila Duarte",
      "Delfina Ojeda",
      "Emilia Ponce",
      "Gala Iriarte",
      "Hernán Vidal",
    ]) {
      expect(markup).toContain(dancer);
    }

    expect(markup).toContain("hacen falta 3 para el 10 %");
    expect(markup).toContain("por ser la más cara del bailarín");
  });
});
