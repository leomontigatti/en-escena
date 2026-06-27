import { useSearchParams } from "react-router";

import {
  handlePortalChoreographiesListAction,
  loadPortalChoreographiesList,
} from "@/features/portal/choreographies/list/server";
import { PortalChoreographiesListRouteView } from "@/features/portal/choreographies/list/view";
import type { PortalRouteHandle } from "@/components/portal/ui";

type PortalChoreographiesListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Coreografías" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalChoreographiesList(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalChoreographiesListAction(request);
}

export default function PortalCoreografiasRoute({
  loaderData,
}: PortalChoreographiesListRouteProps) {
  const [searchParams] = useSearchParams();

  return (
    <PortalChoreographiesListRouteView
      created={searchParams.get("creada") === "1"}
      deleted={searchParams.get("eliminada") === "1"}
      loaderData={loaderData}
    />
  );
}
