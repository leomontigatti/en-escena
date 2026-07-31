import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { AllocationDetailPrototypeView } from "./detail-view";
import { AllocationListPrototypeView } from "./list-view";

describe("allocation prototype", () => {
  it("renders the list with its figures and the actions menu", () => {
    const markup = renderRouteView(
      <AllocationListPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion",
    );

    expect(markup).not.toContain("Elegí un evento activo");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Seña adeudada");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Acciones");
    expect(markup).toContain("Estado del prototipo");
    // A choreography short of its deposit greys **both** `Seña` and `Saldo
    // adeudado`, the same reading as the inscriptions table. Scoped to the row,
    // so a muted span elsewhere in the layout cannot pass this for it.
    const row = markup.slice(
      markup.indexOf("Reflejos"),
      markup.indexOf("</tr>", markup.indexOf("Reflejos")),
    );
    expect(row.split('<span class="text-muted-foreground">')).toHaveLength(3);
  });

  it("titles the detail with the choreography and carries the five metrics", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    expect(markup).not.toContain("Elegí un evento activo");
    // The title is the choreography and its group type, not the generic
    // "Detalle financiero".
    expect(markup).toContain(
      '<h2 class="text-xl font-semibold">Reflejos · Grupo</h2>',
    );
    for (const metric of [
      "Seña adeudada",
      "Saldo adeudado",
      "Saldo disponible",
    ]) {
      expect(markup).toContain(metric);
    }
    expect(markup).toContain("Estado del prototipo");
  });

  it("resolves per inscription: no selection column, no bulk presets", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    // No selection column, and no header actions menu to hang bulk actions on.
    expect(markup).not.toContain("Seleccionar todo");
    expect(markup).not.toContain('aria-label="Acciones"');
    // The dancer's name is the action, as a button holding its own dialog
    // state — the pattern `DancerNameCell` already uses in the real view.
    expect(markup).not.toContain("asignar=");
    expect(markup).toContain("Ana Rivas");
    expect(markup).not.toContain("Buscar inscripción por bailarín");
  });

  it("raises the group-type anomaly as a generic alert, not a badge", () => {
    // «Umbral» is a Dúo whose roster picked a Grupo price.
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain(
      "Existen inscripciones con un precio diferente al tipo de grupo",
    );
    // Generic and title-less: it points at the list instead of counting or
    // naming rows, and carries no `AlertTitle`.
    expect(markup).not.toContain("inscripción tiene");
    expect(markup).not.toContain("Precios de otro tipo de grupo");
  });

  it("has no Sin precio status anywhere: every inscription carries a price", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    expect(markup).not.toContain("Sin precio");
    expect(markup).toContain("Precio");
  });

  it("lets the inscription's anomaly badge replace its status badge", () => {
    // «Umbral» is a Dúo whose roster has an inscription on a Grupo price.
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    expect(markup).toContain("Precio de otro tipo de grupo");
    // The anomalous row shows no status badge of its own — the two do not sit
    // side by side. Only the untouched rows still carry one.
    const anomalousRow = markup.slice(
      markup.indexOf("Gala Iriarte"),
      markup.indexOf("</tr>", markup.indexOf("Gala Iriarte")),
    );
    expect(anomalousRow).toContain("Precio de otro tipo de grupo");
    expect(anomalousRow).not.toContain("Seña pendiente");
    expect(anomalousRow).not.toContain("Señada");
    expect(anomalousRow).not.toContain("Pagada");
  });

  it("mutes the figures that are still tentative", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    // At least one row is short of its deposit, so its `Seña` reads muted.
    expect(markup).toContain('<span class="text-muted-foreground">');
  });

  it("carries the group type of whichever choreography is chosen", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    expect(markup).toContain(
      '<h2 class="text-xl font-semibold">Umbral · Dúo</h2>',
    );
  });
});
