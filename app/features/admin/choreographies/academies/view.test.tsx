import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { ChoreographyAcademiesRouteView } from "@/features/admin/choreographies/academies/view";

type LoaderData = Parameters<
  typeof ChoreographyAcademiesRouteView
>[0]["loaderData"];

describe("ChoreographyAcademiesRouteView", () => {
  test("links each academy to its choreographies, with the three counts", () => {
    const markup = render({
      rows: [
        {
          academyId: "academy-1",
          academyName: "Academia Sur",
          choreographyCount: 7,
          incompleteCount: 3,
          withdrawnCount: 2,
        },
      ],
      selectedEventId: "event-1",
    });

    for (const column of [
      "Academia",
      "Coreografías",
      "Incompletas",
      "Retiradas",
    ]) {
      expect(markup).toContain(`>${column}<`);
    }
    expect(markup).toContain('href="/administracion/coreografias/academy-1"');
    expect(markup).toContain(">Academia Sur</a>");
    expect(markup).toMatch(/>7<.*>3<.*>2</s);
    expect(markup).toContain("Buscar academia por nombre");
  });

  test("says so when no academy has choreographies in the event", () => {
    expect(render({ rows: [], selectedEventId: "event-1" })).toContain(
      "Todavía no hay academias con coreografías en este evento.",
    );
  });

  test("asks for an active event before anything else", () => {
    expect(render({ rows: [], selectedEventId: null })).toContain(
      "Elegí un evento activo para revisar coreografías",
    );
  });
});

function render(loaderData: LoaderData) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion/coreografias"]}>
      <ChoreographyAcademiesRouteView loaderData={loaderData} />
    </MemoryRouter>,
  );
}
