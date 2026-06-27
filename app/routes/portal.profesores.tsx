import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  handlePortalProfessorsListAction,
  loadPortalProfessorsList,
} from "@/features/portal/professors/list/server";
import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";

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

export default function PortalProfesoresRoute({
  loaderData,
}: PortalProfessorsListRouteProps) {
  return <PortalProfessorsListRouteView loaderData={loaderData} />;
}
