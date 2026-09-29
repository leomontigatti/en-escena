import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { RecategorisedChoreographiesAlert } from "@/components/shared/recategorised-choreographies-alert";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";

function render(
  surface: "admin" | "portal",
  choreographies: RecategorisedChoreography[],
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RecategorisedChoreographiesAlert
        buildChoreographyHref={(choreographyId) =>
          surface === "admin"
            ? `/administracion/coreografias/academy-1/${choreographyId}`
            : `/portal/coreografias/${choreographyId}`
        }
        choreographies={choreographies}
        surface={surface}
      />
    </MemoryRouter>,
  );
}

const moved: RecategorisedChoreography = {
  choreographyId: "choreography-1",
  name: "Vals",
  categoryName: "Juvenil I",
  experienceLevelCleared: false,
};
const cleared: RecategorisedChoreography = {
  ...moved,
  choreographyId: "choreography-2",
  name: "Tango",
  experienceLevelCleared: true,
};

describe("RecategorisedChoreographiesAlert", () => {
  test("renders nothing when the correction recategorised nothing", () => {
    expect(render("admin", [])).toBe("");
  });

  test("links each choreography where the caller says", () => {
    expect(render("admin", [moved])).toContain(
      'href="/administracion/coreografias/academy-1/choreography-1"',
    );
    expect(render("portal", [moved])).toContain(
      'href="/portal/coreografias/choreography-1"',
    );
  });

  test("sets each choreography on a bullet of its own", () => {
    const markup = render("portal", [moved, cleared]);

    expect(markup).toMatch(/<ul class="[^"]*list-disc[^"]*"/);
    expect(markup.match(/<li>/g)).toHaveLength(2);
  });

  test("tells the administrator they can pick the missing level", () => {
    const markup = render("admin", [cleared]);

    expect(markup).toContain("Coreografías recategorizadas");
    expect(markup).toContain(
      "pasó a la categoría Juvenil I y quedó sin nivel de experiencia. Podés elegirlo desde el detalle.",
    );
  });

  test("asks the academy to get in touch about the missing level", () => {
    expect(render("portal", [cleared])).toContain(
      "pasó a la categoría Juvenil I y quedó sin nivel de experiencia. Comunicate con nosotros para poder solucionarlo.",
    );
  });
});
