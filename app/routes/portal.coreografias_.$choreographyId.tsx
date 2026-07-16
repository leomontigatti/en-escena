import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import type { PortalChoreographyMusicActionData } from "@/features/portal/choreographies/detail/music-editor.shared";
import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import {
  handlePortalChoreographyDetailRouteAction,
  loadPortalChoreographyDetail,
} from "@/features/portal/choreographies/detail/server";

type PortalChoreographyDetailRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

type LoaderData = PortalChoreographyDetailRouteProps["loaderData"];

export const meta = () => [
  { title: "Detalle de Coreografía | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  return await loadPortalChoreographyDetail({ request, params });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  return await handlePortalChoreographyDetailRouteAction({ request, params });
}

export default function PortalChoreographyDetailRoute({
  loaderData,
}: PortalChoreographyDetailRouteProps) {
  const actionData = useActionData<
    typeof action
  >() as PortalChoreographyMusicActionData;

  return (
    <PortalChoreographyDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
