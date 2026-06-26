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
    filters: listResult.filters,
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
  filters: LoaderData["filters"];
}) {
  const searchParams = new URLSearchParams(input.currentSearch);

  if (input.filters.query.length > 0) {
    searchParams.set("busqueda", input.filters.query);
  } else {
    searchParams.delete("busqueda");
  }

  if (input.filters.status) {
    searchParams.set("estado", input.filters.status);
  } else {
    searchParams.delete("estado");
  }

  if (input.filters.modalityId) {
    searchParams.set("modalidad", input.filters.modalityId);
  } else {
    searchParams.delete("modalidad");
  }

  if (input.filters.category) {
    searchParams.set("categoria", input.filters.category);
  } else {
    searchParams.delete("categoria");
  }

  if (input.filters.groupType) {
    searchParams.set("tipo-grupo", input.filters.groupType);
  } else {
    searchParams.delete("tipo-grupo");
  }

  if (!isDefaultAdministrativeChoreographyOrder(input.filters.order)) {
    searchParams.set(
      "orden",
      `${input.filters.order.columnId}:${input.filters.order.direction}`,
    );
  } else {
    searchParams.delete("orden");
  }

  if (input.filters.page > 1) {
    searchParams.set("pagina", String(input.filters.page));
  } else {
    searchParams.delete("pagina");
  }

  return searchParams.toString();
}
