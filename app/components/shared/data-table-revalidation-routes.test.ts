import type { ShouldRevalidateFunction } from "react-router";
import { describe, expect, test } from "vitest";

import * as adminAcademies from "@/routes/administracion.academias";
import * as adminCategories from "@/routes/administracion.categorias";
import * as adminChoreographies from "@/routes/administracion.coreografias";
import * as adminComprobantes from "@/routes/administracion.comprobantes";
import * as adminDancers from "@/routes/administracion.bailarines";
import * as adminEvents from "@/routes/administracion.eventos";
import * as adminFinances from "@/routes/administracion.finanzas";
import * as adminAcademyFinances from "@/routes/administracion.finanzas_.$academyId";
import * as adminChoreographyFinances from "@/routes/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";
import * as adminModalities from "@/routes/administracion.modalidades";
import * as adminPayments from "@/routes/administracion.pagos";
import * as adminPrices from "@/routes/administracion.precios";
import * as adminProfessors from "@/routes/administracion.profesores";
import * as adminSchedules from "@/routes/administracion.cronogramas";
import * as adminUsers from "@/routes/administracion.usuarios";
import * as portalChoreographies from "@/routes/portal.coreografias";
import * as portalDancers from "@/routes/portal.bailarines";
import * as portalFinances from "@/routes/portal.finanzas";
import * as portalPayments from "@/routes/portal.pagos";
import * as portalProfessors from "@/routes/portal.profesores";

type RouteModule = { shouldRevalidate?: ShouldRevalidateFunction };

/**
 * Every route rendering a browser-paginated list, with the faceted filter
 * parameters its table puts in the address bar. The names must match the
 * filter group ids the view declares; a missing one costs an unnecessary
 * reload and never a wrong result.
 */
const browserPaginatedRoutes: {
  filterParamNames: string[];
  name: string;
  path: string;
  routeModule: RouteModule;
}[] = [
  {
    filterParamNames: ["participando"],
    name: "administración · academias",
    path: "/administracion/academias",
    routeModule: adminAcademies,
  },
  {
    filterParamNames: ["tipo-de-grupo"],
    name: "administración · categorías",
    path: "/administracion/categorias",
    routeModule: adminCategories,
  },
  {
    filterParamNames: ["modalidad"],
    name: "administración · cronogramas",
    path: "/administracion/cronogramas",
    routeModule: adminSchedules,
  },
  {
    filterParamNames: [],
    name: "administración · eventos",
    path: "/administracion/eventos",
    routeModule: adminEvents,
  },
  {
    filterParamNames: [],
    name: "administración · finanzas",
    path: "/administracion/finanzas",
    routeModule: adminFinances,
  },
  {
    filterParamNames: ["estado"],
    name: "administración · finanzas de una academia",
    path: "/administracion/finanzas/academia-1",
    routeModule: adminAcademyFinances,
  },
  {
    filterParamNames: [],
    name: "administración · finanzas de una coreografía",
    path: "/administracion/finanzas/academia-1/coreografias/coreografia-1",
    routeModule: adminChoreographyFinances,
  },
  {
    filterParamNames: [],
    name: "administración · modalidades",
    path: "/administracion/modalidades",
    routeModule: adminModalities,
  },
  {
    filterParamNames: ["tipo-de-grupo", "cronograma"],
    name: "administración · precios",
    path: "/administracion/precios",
    routeModule: adminPrices,
  },
  {
    filterParamNames: ["participacion", "verificacion", "archivo"],
    name: "portal · bailarines",
    path: "/portal/bailarines",
    routeModule: portalDancers,
  },
  {
    filterParamNames: ["estado", "modalidad", "categoria", "tipo-de-grupo"],
    name: "portal · coreografías",
    path: "/portal/coreografias",
    routeModule: portalChoreographies,
  },
  {
    filterParamNames: ["estado"],
    name: "portal · finanzas",
    path: "/portal/finanzas",
    routeModule: portalFinances,
  },
  {
    filterParamNames: ["medio"],
    name: "portal · pagos",
    path: "/portal/pagos",
    routeModule: portalPayments,
  },
  {
    filterParamNames: ["participacion", "completitud", "archivo"],
    name: "portal · profesores",
    path: "/portal/profesores",
    routeModule: portalProfessors,
  },
];

/** The query string *is* the query on these, so none of them may opt out. */
const serverPaginatedRoutes: { name: string; routeModule: object }[] = [
  { name: "administración · bailarines", routeModule: adminDancers },
  { name: "administración · comprobantes", routeModule: adminComprobantes },
  { name: "administración · coreografías", routeModule: adminChoreographies },
  { name: "administración · pagos", routeModule: adminPayments },
  { name: "administración · profesores", routeModule: adminProfessors },
  { name: "administración · usuarios", routeModule: adminUsers },
];

describe("revalidation on the browser-paginated routes", () => {
  test.each(browserPaginatedRoutes)(
    "$name skips the reload while the reader pages, searches and sorts",
    ({ path, routeModule }) => {
      expect(
        decide({
          currentSearch: "?pagina=2",
          nextSearch: "?pagina=3",
          path,
          routeModule,
        }),
      ).toBe(false);
      expect(
        decide({
          currentSearch: "",
          nextSearch: "?busqueda=ana",
          path,
          routeModule,
        }),
      ).toBe(false);
      expect(
        decide({
          currentSearch: "?orden=nombre:asc",
          nextSearch: "?orden=nombre:desc",
          path,
          routeModule,
        }),
      ).toBe(false);
    },
  );

  test.each(
    browserPaginatedRoutes.filter((route) => route.filterParamNames.length > 0),
  )(
    "$name skips the reload for each of its own filters",
    ({ filterParamNames, path, routeModule }) => {
      for (const filterParamName of filterParamNames) {
        expect(
          decide({
            currentSearch: "?pagina=4",
            nextSearch: `?${filterParamName}=alguno`,
            path,
            routeModule,
          }),
        ).toBe(false);
      }
    },
  );

  test.each(browserPaginatedRoutes)(
    "$name still reloads after an action submission",
    ({ path, routeModule }) => {
      expect(
        decide({
          currentSearch: "?pagina=2",
          formMethod: "POST",
          nextSearch: "?pagina=2",
          path,
          routeModule,
        }),
      ).toBe(true);
    },
  );

  test.each(browserPaginatedRoutes)(
    "$name still reloads when a parameter of its own changed",
    ({ path, routeModule }) => {
      expect(
        decide({
          currentSearch: "",
          nextSearch: "?evento=evento-1",
          path,
          routeModule,
        }),
      ).toBe(true);
    },
  );
});

describe("revalidation on the server-paginated routes", () => {
  test.each(serverPaginatedRoutes)(
    "$name keeps reloading, because there the query string is the query",
    ({ routeModule }) => {
      expect("shouldRevalidate" in routeModule).toBe(false);
    },
  );
});

function decide({
  currentSearch,
  formMethod,
  nextSearch,
  path,
  routeModule,
}: {
  currentSearch: string;
  formMethod?: "POST";
  nextSearch: string;
  path: string;
  routeModule: RouteModule;
}) {
  const shouldRevalidate = routeModule.shouldRevalidate;

  if (shouldRevalidate === undefined) {
    throw new Error(`The route at ${path} does not declare the shared rule.`);
  }

  return shouldRevalidate({
    currentUrl: buildUrl(path, currentSearch),
    defaultShouldRevalidate: true,
    formMethod,
    nextUrl: buildUrl(path, nextSearch),
  } as Parameters<ShouldRevalidateFunction>[0]);
}

function buildUrl(pathname: string, search: string) {
  return new URL(`https://en-escena.test${pathname}${search}`);
}
