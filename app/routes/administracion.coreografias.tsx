import type { AdminRouteHandle } from "@/components/admin/shell";
import { redirect } from "react-router";
import type { Route } from "./+types/administracion.coreografias";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  isDefaultAdministrativeChoreographyOrder,
  loadAdministrativeChoreographies,
  readAdministrativeChoreographyFilters,
} from "@/features/admin/choreographies/list/server";
import { AdministracionCoreografiasRouteView } from "@/features/admin/choreographies/list/view";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionCoreografiasRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Coreografías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const url = new URL(request.url);
  const filters = readAdministrativeChoreographyFilters(url.searchParams);

  const listResult = await loadAdministrativeChoreographies({
    filters,
    selectedEventId: eventContext.selectedEventId,
  });

  const canonicalSearch = buildCanonicalAdministrativeChoreographiesSearch({
    currentSearch: url.search,
    order: listResult.filters.order,
    page: listResult.filters.page,
    query: listResult.filters.query,
  });
  const currentSearch = new URLSearchParams(url.search).toString();

  if (canonicalSearch !== currentSearch) {
    throw redirect(
      canonicalSearch.length > 0
        ? `${url.pathname}?${canonicalSearch}`
        : url.pathname,
    );
  }

  return listResult;
}

export { AdministracionCoreografiasRouteView };

export default function AdministracionCoreografiasRoute({
  loaderData,
}: AdministracionCoreografiasRouteProps) {
  return <AdministracionCoreografiasRouteView loaderData={loaderData} />;
}

function buildCanonicalAdministrativeChoreographiesSearch(input: {
  currentSearch: string;
  order: LoaderData["filters"]["order"];
  page: number;
  query: string;
}) {
  const searchParams = new URLSearchParams(input.currentSearch);

  if (input.query.length > 0) {
    searchParams.set("busqueda", input.query);
  } else {
    searchParams.delete("busqueda");
  }

  if (!isDefaultAdministrativeChoreographyOrder(input.order)) {
    searchParams.set(
      "orden",
      `${input.order.columnId}:${input.order.direction}`,
    );
  } else {
    searchParams.delete("orden");
  }

  if (input.page > 1) {
    searchParams.set("pagina", String(input.page));
  } else {
    searchParams.delete("pagina");
  }

  return searchParams.toString();
}
