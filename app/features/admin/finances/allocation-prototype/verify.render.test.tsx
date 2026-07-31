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
    expect(markup).toContain("Qué cubrió cada pago");
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
    // The dancer's name is the action: no `Acciones` column, and no search box.
    expect(markup).toContain("asignar=ins-1");
    expect(markup).not.toContain("Buscar inscripción por bailarín");
  });

  it("keeps the chosen choreography when opening the allocate dialog", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    // A bare `?asignar=` would drop `coreografia` and bounce back to the first.
    expect(markup).toContain("coreografia=cho-2&amp;asignar=ins-7");
  });

  it("raises the group-type anomaly as a generic alert, not a badge", () => {
    // «Umbral» is a Dúo whose roster picked a Grupo price.
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    expect(markup).toContain("Precios de otro tipo de grupo");
    expect(markup).toContain('role="alert"');
    // Generic: the alert counts the rows, the table names them.
    expect(markup).toContain("1 inscripción tiene");
  });

  it("has no Sin precio status anywhere: every inscription carries a price", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    expect(markup).not.toContain("Sin precio");
    expect(markup).toContain("Precio");
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
