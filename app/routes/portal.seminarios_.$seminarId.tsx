import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  handlePortalSeminarDetailAction,
  loadPortalSeminarDetail,
} from "@/features/portal/seminars/detail/server";
import { PortalSeminarDetailRouteView } from "@/features/portal/seminars/detail/view";

type PortalSeminarDetailRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

type LoaderData = PortalSeminarDetailRouteProps["loaderData"];

export const meta = () => [
  { title: "Detalle de seminario | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Seminarios", to: "/portal/seminarios" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return data?.seminar ? { label: data.seminar.instructorName } : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { seminarId?: string };
}) {
  return await loadPortalSeminarDetail({ params, request });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { seminarId?: string };
}) {
  return await handlePortalSeminarDetailAction({ params, request });
}

export default function PortalSeminarDetailRoute({
  loaderData,
}: PortalSeminarDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalSeminarDetailRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
