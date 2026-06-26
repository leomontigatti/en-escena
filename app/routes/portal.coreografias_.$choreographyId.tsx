import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  resolveChoreographyDancersIntent,
  type ChoreographyRosterEditorActionData,
} from "@/features/portal/choreographies/detail/roster-editor";
import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import {
  handlePortalChoreographyDetailRouteAction,
  loadPortalChoreographyDetail,
} from "@/features/portal/choreographies/detail/server";

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
};

type ActionData = ChoreographyRosterEditorActionData;

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

export { PortalChoreographyDetailRouteView };

export function shouldRevalidate({
  defaultShouldRevalidate,
  formData,
}: {
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  if (formData?.get("intent") === resolveChoreographyDancersIntent) {
    return false;
  }

  return defaultShouldRevalidate;
}

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
  const actionData = getUpdateActionData(useActionData<typeof action>());

  return (
    <PortalChoreographyDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function getUpdateActionData(
  actionData: ActionData | DancerResolutionActionData,
): ActionData {
  if (!actionData || !("status" in actionData)) {
    return undefined;
  }

  return actionData.status === "update-error" ? actionData : undefined;
}
