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

/**
 * Wiring only. What the rule *decides* is covered by the pure function in
 * `data-table-revalidation.test.ts`, and which parameters each route names is
 * no longer assertable here: the routes read those ids from the very view that
 * renders the filters, so the two cannot drift apart.
 */
const browserPaginatedRoutes: { name: string; routeModule: object }[] = [
  { name: "administración · academias", routeModule: adminAcademies },
  { name: "administración · categorías", routeModule: adminCategories },
  { name: "administración · cronogramas", routeModule: adminSchedules },
  { name: "administración · eventos", routeModule: adminEvents },
  { name: "administración · finanzas", routeModule: adminFinances },
  {
    name: "administración · finanzas de una academia",
    routeModule: adminAcademyFinances,
  },
  {
    name: "administración · finanzas de una coreografía",
    routeModule: adminChoreographyFinances,
  },
  { name: "administración · modalidades", routeModule: adminModalities },
  { name: "administración · precios", routeModule: adminPrices },
  { name: "portal · bailarines", routeModule: portalDancers },
  { name: "portal · coreografías", routeModule: portalChoreographies },
  { name: "portal · finanzas", routeModule: portalFinances },
  { name: "portal · pagos", routeModule: portalPayments },
  { name: "portal · profesores", routeModule: portalProfessors },
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
    "$name declares the shared rule",
    ({ routeModule }) => {
      expect("shouldRevalidate" in routeModule).toBe(true);
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
