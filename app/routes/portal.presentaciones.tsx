import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalPresentationsList } from "@/features/portal/presentations/list/server";
import { PortalPresentationsListView } from "@/features/portal/presentations/list/view";
import { dayTabParam } from "@/lib/shared/url-tab";

type PortalPresentationsRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Presentaciones | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Presentaciones" }],
} satisfies PortalRouteHandle;

// The list is whole in the browser: its day tab and its search only narrow it.
export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [dayTabParam],
});

export async function loader({ request }: { request: Request }) {
  return await loadPortalPresentationsList(request);
}

export default function PortalPresentationsListRoute({
  loaderData,
}: PortalPresentationsRouteProps) {
  return <PortalPresentationsListView loaderData={loaderData} />;
}
