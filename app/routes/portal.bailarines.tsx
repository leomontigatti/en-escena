import {
  handlePortalDancersListAction,
  loadPortalDancersList,
} from "@/features/portal/dancers/list/server";
import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";
import type { PortalRouteHandle } from "@/components/portal/ui";

type PortalDancersListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Bailarines | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Bailarines" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalDancersList(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalDancersListAction(request);
}

export default function PortalBailarinesRoute({
  loaderData,
}: PortalDancersListRouteProps) {
  return <PortalDancersListRouteView loaderData={loaderData} />;
}
