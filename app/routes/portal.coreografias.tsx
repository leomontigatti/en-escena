import { useSearchParams } from "react-router";

import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import {
  handlePortalChoreographiesListAction,
  loadPortalChoreographiesList,
} from "@/features/portal/choreographies/list/server";
import {
  PortalChoreographiesListRouteView,
  portalChoreographyFacetedFilterIds,
} from "@/features/portal/choreographies/list/view";
import type { PortalRouteHandle } from "@/components/portal/ui";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.coreografias";

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

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalChoreographyFacetedFilterIds],
});

export default function PortalCoreografiasRoute({
  loaderData,
}: PortalChoreographiesListRouteProps) {
  const [searchParams] = useSearchParams();

  return (
    <PortalChoreographiesListRouteView
      created={searchParams.get("creada") === "1"}
      loaderData={loaderData}
    />
  );
}
