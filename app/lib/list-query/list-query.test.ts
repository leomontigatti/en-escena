import { describe, expect, test } from "vitest";

import {
  buildCanonicalListSearch,
  describeEmptyList,
  paginateList,
  readListQuery,
  withoutListQuery,
} from "@/lib/list-query/list-query";

const spec = {
  orderColumnIds: ["nombre", "numero"],
  defaultOrder: { columnId: "numero", direction: "asc" },
} as const;

function readQuery(search: string) {
  return readListQuery(new URLSearchParams(search), spec);
}

describe("readListQuery", () => {
  test.each([
    ["", 1],
    ["pagina=3", 3],
    ["pagina=0", 1],
    ["pagina=-2", 1],
    ["pagina=2.5", 1],
    ["pagina=dos", 1],
  ])("reads `%s` as page %i", (search, page) => {
    expect(readQuery(search).page).toBe(page);
  });

  test.each([
    ["orden=nombre:desc", { columnId: "nombre", direction: "desc" }],
    ["orden=numero:asc", { columnId: "numero", direction: "asc" }],
    ["orden=academia:asc", { columnId: "numero", direction: "asc" }],
    ["orden=nombre:arriba", { columnId: "numero", direction: "asc" }],
    ["orden=nombre", { columnId: "numero", direction: "asc" }],
    ["orden=:desc", { columnId: "numero", direction: "asc" }],
    ["", { columnId: "numero", direction: "asc" }],
  ])(
    "reads `%s` as its order, falling back to the default",
    (search, order) => {
      expect(readQuery(search).order).toEqual(order);
    },
  );

  test.each([
    ["busqueda=%20Ana%20", "Ana"],
    ["busqueda=%20%20", ""],
    ["", ""],
  ])("reads `%s` as the search `%s`", (search, expected) => {
    expect(readQuery(search).search).toBe(expected);
  });
});

describe("paginateList", () => {
  test("pages 120 rows at 50 a page, clamping a page past the last one", () => {
    expect(paginateList({ page: 7, pageSize: 50, totalCount: 120 })).toEqual({
      limit: 50,
      offset: 100,
      page: 3,
      totalPages: 3,
    });
  });

  test("takes the page size from the caller rather than holding one", () => {
    expect(paginateList({ page: 2, pageSize: 20, totalCount: 120 })).toEqual({
      limit: 20,
      offset: 20,
      page: 2,
      totalPages: 6,
    });
  });

  test("keeps an empty list on one page", () => {
    expect(paginateList({ page: 4, pageSize: 50, totalCount: 0 })).toEqual({
      limit: 50,
      offset: 0,
      page: 1,
      totalPages: 1,
    });
  });
});

describe("buildCanonicalListSearch", () => {
  const defaultQuery = {
    order: spec.defaultOrder,
    page: 1,
    search: "",
  };

  test("leaves every default out of the address", () => {
    expect(
      buildCanonicalListSearch({
        currentSearch: "busqueda=&orden=numero:asc&pagina=1&estado=",
        facets: { estado: null },
        query: defaultQuery,
        spec,
      }),
    ).toBe("");
  });

  test("writes the applied query in one fixed order", () => {
    expect(
      buildCanonicalListSearch({
        currentSearch: "pagina=2&orden=nombre:desc&tipo=duo&busqueda=Ana",
        facets: { estado: "completa", tipo: "duo" },
        query: {
          order: { columnId: "nombre", direction: "desc" },
          page: 2,
          search: "Ana",
        },
        spec,
      }),
    ).toBe(
      "busqueda=Ana&estado=completa&tipo=duo&orden=nombre%3Adesc&pagina=2",
    );
  });

  test("drops a parameter the list does not declare", () => {
    expect(
      buildCanonicalListSearch({
        currentSearch: "evento=abc&porcion=sena&busqueda=Ana",
        facets: {},
        query: { ...defaultQuery, search: "Ana" },
        spec,
      }),
    ).toBe("busqueda=Ana");
  });

  test("keeps a parameter the list declares as preserved", () => {
    expect(
      buildCanonicalListSearch({
        currentSearch: "modo=editar&pagina=3",
        facets: {},
        query: { ...defaultQuery, page: 3 },
        spec: { ...spec, preservedParamNames: ["modo"] },
      }),
    ).toBe("pagina=3&modo=editar");
  });

  test("gives back a canonical search unchanged, so it never redirects twice", () => {
    const input = {
      facets: { estado: "incompleta" },
      query: { ...defaultQuery, search: "José María", page: 4 },
      spec,
    };
    const canonicalSearch = buildCanonicalListSearch({
      ...input,
      currentSearch: "",
    });

    expect(
      buildCanonicalListSearch({ ...input, currentSearch: canonicalSearch }),
    ).toBe(canonicalSearch);
  });
});

describe("describeEmptyList", () => {
  test("names the filters only on a list that has them", () => {
    expect(describeEmptyList("categorías", "search-and-filters")).toEqual({
      nothingMatched:
        "No hay categorías que coincidan con la búsqueda o los filtros.",
      nothingYet: "Todavía no hay categorías.",
    });
    expect(describeEmptyList("eventos", "search").nothingMatched).toBe(
      "No hay eventos que coincidan con la búsqueda.",
    );
  });
});

describe("withoutListQuery", () => {
  test("drops the search, order and page and keeps every other parameter", () => {
    expect(
      withoutListQuery("?busqueda=Tango&orden=nombre.desc&pagina=2&evento=e1"),
    ).toBe("?evento=e1");
  });

  test("answers null when there is no list state to drop", () => {
    expect(withoutListQuery("?evento=e1")).toBeNull();
    expect(withoutListQuery("")).toBeNull();
  });
});
