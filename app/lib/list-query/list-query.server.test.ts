import { describe, expect, test } from "vitest";

import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";

const spec = {
  orderColumnIds: ["nombre"],
  defaultOrder: { columnId: "nombre", direction: "asc" },
} as const;

const appliedQuery = {
  facets: { estado: "archivados", tipo: "duo" },
  query: {
    order: spec.defaultOrder,
    page: 2,
    search: "Ana",
  },
  spec,
};

describe("redirectToCanonicalListUrl", () => {
  // The table writes a filter where the reader clicked it, so the same query
  // arrives in any order; reordering it would cost a redirect per click.
  test("leaves a URL holding the applied query in another order where it is", () => {
    expect(() =>
      redirectToCanonicalListUrl(
        new Request(
          "http://localhost/lista?tipo=duo&pagina=2&estado=archivados&busqueda=Ana",
        ),
        appliedQuery,
      ),
    ).not.toThrow();
  });

  test("redirects a URL carrying more than the applied query", () => {
    let thrown: unknown;

    try {
      redirectToCanonicalListUrl(
        new Request(
          "http://localhost/lista?tipo=duo&pagina=2&estado=archivados&busqueda=Ana&evento=abc",
        ),
        appliedQuery,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe(
      "/lista?busqueda=Ana&estado=archivados&tipo=duo&pagina=2",
    );
  });
});
