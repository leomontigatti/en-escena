import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AdminResourceLayout } from "@/components/admin/resource-layout";

describe("AdminResourceLayout", () => {
  test("allows overriding event-required empty-state copy per screen", () => {
    const markup = renderToStaticMarkup(
      <AdminResourceLayout
        selectedEventId={null}
        title="Coreografías"
        description="Revisá el evento activo."
        eventRequiredEmptyState={{
          title: "Elegí un evento activo para revisar coreografías",
          description:
            "Activá un evento para consultar las coreografías registradas por las academias.",
        }}
      >
        <div>Contenido</div>
      </AdminResourceLayout>,
    );

    expect(markup).toContain(
      "Elegí un evento activo para revisar coreografías",
    );
    expect(markup).toContain(
      "Activá un evento para consultar las coreografías registradas por las academias.",
    );
    expect(markup).not.toContain("editar sus bases");
  });
});
