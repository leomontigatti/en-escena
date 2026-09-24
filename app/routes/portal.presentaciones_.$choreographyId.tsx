import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalPresentationEvaluation } from "@/features/portal/presentations/detail/server";
import { PortalPresentationEvaluationView } from "@/features/portal/presentations/detail/view";

type PortalPresentationEvaluationRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Evaluación | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Presentaciones", to: "/portal/presentaciones" },
    (match) => {
      const data = match.data as
        PortalPresentationEvaluationRouteProps["loaderData"] | undefined;

      return data ? { label: data.title } : null;
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
  return await loadPortalPresentationEvaluation({ params, request });
}

export default function PortalPresentationEvaluationRoute({
  loaderData,
}: PortalPresentationEvaluationRouteProps) {
  return <PortalPresentationEvaluationView loaderData={loaderData} />;
}
