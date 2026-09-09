import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  handlePortalSeminarsListAction,
  loadPortalSeminarsList,
} from "@/features/portal/seminars/list/server";
import { PortalSeminarsListRouteView } from "@/features/portal/seminars/list/view";

type PortalSeminarsListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Seminarios | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Seminarios" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalSeminarsList(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalSeminarsListAction(request);
}

export default function PortalSeminariosRoute({
  loaderData,
}: PortalSeminarsListRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalSeminarsListRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
