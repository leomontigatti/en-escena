import { describe, expect, test } from "vitest";

import {
  createDataTableShouldRevalidate,
  shouldRevalidateDataTableRoute,
} from "@/components/shared/data-table-revalidation";

const listPath = "/administracion/finanzas/academia-1";

describe("shouldRevalidateDataTableRoute", () => {
  test("skips the reload when only the page changed", () => {
    expect(
      decide({
        currentSearch: "?pagina=2",
        nextSearch: "?pagina=3",
      }),
    ).toBe(false);
  });

  test("skips the reload when only the search changed", () => {
    expect(
      decide({
        currentSearch: "",
        nextSearch: "?busqueda=ana",
      }),
    ).toBe(false);
  });

  test("skips the reload when only the sort changed", () => {
    expect(
      decide({
        currentSearch: "?orden=nombre:asc",
        nextSearch: "?orden=nombre:desc",
      }),
    ).toBe(false);
  });

  test("skips the reload when only a named filter changed", () => {
    expect(
      decide({
        currentSearch: "?estado=pendiente",
        filterParamNames: ["estado"],
        nextSearch: "?estado=pagado",
      }),
    ).toBe(false);
  });

  test("skips the reload when a filter change also dropped the page", () => {
    expect(
      decide({
        currentSearch: "?pagina=4&busqueda=ana&orden=nombre:asc",
        filterParamNames: ["estado"],
        nextSearch: "?busqueda=ana&orden=nombre:asc&estado=pagado",
      }),
    ).toBe(false);
  });

  test("defers to the router when the path changed", () => {
    expect(
      decide({
        currentSearch: "?pagina=2",
        nextPath: "/administracion/finanzas/academia-2",
        nextSearch: "?pagina=3",
      }),
    ).toBe(true);
  });

  test("defers to the router after an action submission", () => {
    expect(
      decide({
        currentSearch: "?pagina=2",
        formMethod: "POST",
        nextSearch: "?pagina=3",
      }),
    ).toBe(true);
  });

  test("defers to the router when a parameter the route did not name changed", () => {
    expect(
      decide({
        currentSearch: "?pagina=2",
        filterParamNames: ["estado"],
        nextSearch: "?pagina=2&evento=evento-1",
      }),
    ).toBe(true);
  });

  test("defers to the router when nothing in the query string changed", () => {
    expect(
      decide({ currentSearch: "?pagina=2", nextSearch: "?pagina=2" }),
    ).toBe(true);
  });

  test("carries the router's own answer through when it declines the reload", () => {
    expect(
      decide({
        currentSearch: "?pagina=2",
        defaultShouldRevalidate: false,
        nextSearch: "?evento=evento-1",
      }),
    ).toBe(false);
  });

  test("honours the per-view parameter names a view renamed", () => {
    expect(
      decide({
        currentSearch: "?p=2",
        nextSearch: "?p=3",
        pageParamName: "p",
      }),
    ).toBe(false);
  });
});

describe("createDataTableShouldRevalidate", () => {
  test("declares the rule for a route in one line", () => {
    const shouldRevalidate = createDataTableShouldRevalidate({
      filterParamNames: ["estado"],
    });

    expect(
      shouldRevalidate(
        buildArgs({ currentSearch: "?pagina=2", nextSearch: "?estado=pagado" }),
      ),
    ).toBe(false);
    expect(
      shouldRevalidate(
        buildArgs({ currentSearch: "", nextSearch: "?evento=evento-1" }),
      ),
    ).toBe(true);
  });
});

function decide({
  currentSearch,
  defaultShouldRevalidate = true,
  filterParamNames,
  formMethod,
  nextPath = listPath,
  nextSearch,
  pageParamName,
}: {
  currentSearch: string;
  defaultShouldRevalidate?: boolean;
  filterParamNames?: string[];
  formMethod?: "GET" | "POST";
  nextPath?: string;
  nextSearch: string;
  pageParamName?: string;
}) {
  return shouldRevalidateDataTableRoute({
    currentUrl: buildUrl(listPath, currentSearch),
    defaultShouldRevalidate,
    filterParamNames,
    formMethod,
    nextUrl: buildUrl(nextPath, nextSearch),
    pageParamName,
  });
}

function buildArgs({
  currentSearch,
  nextSearch,
}: {
  currentSearch: string;
  nextSearch: string;
}) {
  return {
    currentUrl: buildUrl(listPath, currentSearch),
    defaultShouldRevalidate: true,
    nextUrl: buildUrl(listPath, nextSearch),
  } as Parameters<ReturnType<typeof createDataTableShouldRevalidate>>[0];
}

function buildUrl(pathname: string, search: string) {
  return new URL(`https://en-escena.test${pathname}${search}`);
}
