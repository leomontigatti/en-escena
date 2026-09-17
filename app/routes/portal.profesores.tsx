import type { PortalRouteHandle } from "@/components/portal/ui";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import {
  handlePortalProfessorsListAction,
  loadPortalProfessorsList,
} from "@/features/portal/professors/list/server";
import {
  PortalProfessorsListRouteView,
  portalProfessorFacetedFilterIds,
} from "@/features/portal/professors/list/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.profesores";

type PortalProfessorsListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Profesores | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Profesores" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalProfessorsList(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalProfessorsListAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalProfessorFacetedFilterIds],
});

export default function PortalProfesoresRoute({
  loaderData,
}: PortalProfessorsListRouteProps) {
  return <PortalProfessorsListRouteView loaderData={loaderData} />;
}
