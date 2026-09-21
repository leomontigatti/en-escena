import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalPresentationsList } from "@/features/portal/presentations/list/server";
import { PortalPresentationsListView } from "@/features/portal/presentations/list/view";

type PortalPresentationsRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Presentaciones | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Presentaciones" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalPresentationsList(request);
}

export default function PortalPresentationsListRoute({
  loaderData,
}: PortalPresentationsRouteProps) {
  return <PortalPresentationsListView loaderData={loaderData} />;
}
