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
    // #618: no figure is muted for being tentative any more. Scoped to the row,
    // so a muted span elsewhere in the layout cannot pass for one.
    const row = markup.slice(
      markup.indexOf("Reflejos"),
      markup.indexOf("</tr>", markup.indexOf("Reflejos")),
    );
    expect(row).not.toContain('<span class="text-muted-foreground">');
    // What replaces it is a whole-column style: the owed column is emphasised.
    expect(markup).toContain("text-right font-medium tabular-nums");
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

    // No selection column, and no per-row actions column: the only actions menu
    // is the header's, which is where #585 put `Imprimir factura`.
    expect(markup).not.toContain("Seleccionar todo");
    const table = markup.slice(markup.indexOf("<table"));
    expect(table).not.toContain('aria-label="Acciones"');
    // The dancer's name is the action, as a button holding its own dialog
    // state — the pattern `DancerNameCell` already uses in the real view.
    expect(markup).not.toContain("asignar=");
    expect(markup).toContain("Ana Rivas");
    expect(markup).not.toContain("Buscar inscripción por bailarín");
  });

  it("raises the over-allocation anomaly as a generic alert, not a badge", () => {
    // «Reflejos» holds Nadia's withdrawn row, which owes zero and still has
    // money on it — over-allocated by construction (#600).
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Existen inscripciones con dinero sobreasignado");
    // Generic and title-less: it points at the list instead of counting or
    // naming rows, and carries no `AlertTitle`.
    expect(markup).not.toContain("inscripción tiene");
    expect(markup).not.toContain("Inscripciones sobreasignadas");
  });

  it("has no group-type anomaly left: #586 deleted it from the model", () => {
    // «Umbral» is a Dúo, and its roster cannot point at a Grupo price any more:
    // a `groupType` change refreshes the price on the roster write.
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    expect(markup).not.toContain("tipo de grupo de la coreografía");
    expect(markup).not.toContain("Precio de otro tipo de grupo");
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

  it("lets a row's derived axis replace its status badge", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    // Nadia's row is `Retirada`, and that badge stands **instead of** a status:
    // the two do not sit side by side, because a withdrawn row demands nothing.
    const withdrawnRow = markup.slice(
      markup.indexOf("Nadia Coria"),
      markup.indexOf("</tr>", markup.indexOf("Nadia Coria")),
    );
    expect(withdrawnRow).toContain("Retirada");
    expect(withdrawnRow).not.toContain("Seña pendiente");
    expect(withdrawnRow).not.toContain("Señada");
    expect(withdrawnRow).not.toContain("Pagada");
  });

  it("mutes no figure per row, and mutes `Asignado` for the whole column", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    // #618 deleted the tentative marking outright: every figure shown is exact.
    // What is left is unconditional and lives in the column definition.
    expect(markup).toContain("Asignado");
    // `Precio base` is not a column any more — it lives in the total's tooltip,
    // where it is the first line of the subtraction (#585).
    expect(markup).not.toContain("Precio base");
    expect(markup).toContain("text-right tabular-nums text-muted-foreground");
    expect(markup).not.toContain('<span class="text-muted-foreground">$');
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
