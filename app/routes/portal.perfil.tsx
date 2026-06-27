import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  handlePortalProfileAction,
  loadPortalProfile,
} from "@/features/portal/profile/server";
import { PortalProfileRouteView } from "@/features/portal/profile/view";

type PortalProfileRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Perfil | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Perfil" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalProfile(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalProfileAction(request);
}

export default function PortalPerfilRoute({
  loaderData,
}: PortalProfileRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalProfileRouteView loaderData={loaderData} actionData={actionData} />
  );
}
