import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { IndividualsListRouteView } from "@/features/admin/individuals/list/view";
import { renderInDataRouter } from "@/lib/test-support/data-router";

describe("IndividualsListRouteView", () => {
  test("names each link state in administration's words", () => {
    const individual = {
      documentNumber: "30123456",
      documentType: "dni" as const,
      firstName: "Ana",
      lastName: "Acosta",
    };
    const markup = renderRoute({
      individuals: [
        { ...individual, id: "individual-1", linkState: "unlinked" },
        { ...individual, id: "individual-2", linkState: "pending" },
        { ...individual, id: "individual-3", linkState: "linked" },
      ],
      totalCount: 3,
    });

    expect(markup).toContain("Incompleto");
    expect(markup).toContain("Sin verificar");
    expect(markup).toContain("Vinculado");
    expect(markup).not.toContain("Sin vincular");
    expect(markup).not.toContain("Pendiente");
  });

  test("tells the auditor it reads, never that it confirms", () => {
    const markup = renderRoute({ canWrite: false });

    expect(markup).toContain(
      "Consultá los particulares y el vínculo de su documento con las academias.",
    );
    expect(markup).not.toContain("confirmá");
  });

  test("links each name to its detail, keeping the list's filters", () => {
    const markup = renderRoute({
      filters: { linkState: "pending", page: 1, query: "" },
      individuals: [
        {
          documentNumber: "30123456",
          documentType: "dni",
          firstName: "Ana",
          id: "individual-1",
          lastName: "Acosta",
          linkState: "pending",
        },
      ],
      totalCount: 1,
    });

    expect(markup).toContain(
      'href="/administracion/particulares/individual-1?vinculo=pending"',
    );
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof IndividualsListRouteView>[0]["loaderData"]
  > = {},
) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/particulares",
      createElement(IndividualsListRouteView, {
        loaderData: {
          canWrite: true,
          filters: { linkState: null, page: 1, query: "" },
          individuals: [],
          totalCount: 0,
          totalPages: 1,
          ...loaderData,
        },
      }),
    ),
  );
}
