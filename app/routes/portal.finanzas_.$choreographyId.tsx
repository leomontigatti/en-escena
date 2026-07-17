import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalChoreographyFinanceDetail } from "@/features/portal/finances/choreography-detail/server";
import { PortalChoreographyFinanceDetailRouteView } from "@/features/portal/finances/choreography-detail/view";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type PortalChoreographyFinanceDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Detalle financiero | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Resumen", to: "/portal/finanzas" },
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
  return await loadPortalChoreographyFinanceDetail({ request, params });
}

export default function PortalChoreographyFinanceDetailRoute({
  loaderData,
}: PortalChoreographyFinanceDetailRouteProps) {
  return <PortalChoreographyFinanceDetailRouteView loaderData={loaderData} />;
}
