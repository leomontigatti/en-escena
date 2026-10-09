import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalResultsList } from "@/features/portal/results/list/server";
import { PortalResultsListView } from "@/features/portal/results/list/view";
import { dayTabParam } from "@/lib/shared/url-tab";

type PortalResultsRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Resultados | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Resultados" }],
} satisfies PortalRouteHandle;

// The list is whole in the browser: its day tab and its search only narrow it.
export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [dayTabParam],
});

export async function loader({ request }: { request: Request }) {
  return await loadPortalResultsList(request);
}

export default function PortalResultsListRoute({
  loaderData,
}: PortalResultsRouteProps) {
  return <PortalResultsListView loaderData={loaderData} />;
}
