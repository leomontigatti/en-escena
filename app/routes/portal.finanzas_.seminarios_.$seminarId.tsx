import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalSeminarFinanceDetail } from "@/features/portal/finances/seminar-detail/server";
import { PortalSeminarFinanceDetailRouteView } from "@/features/portal/finances/seminar-detail/view";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type PortalSeminarFinanceDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Detalle financiero | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Resumen", to: "/portal/finanzas" },
    // The instructor alone, exactly as the page titles itself: a seminar is
    // named by who teaches it on every surface of both sides.
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
  return await loadPortalSeminarFinanceDetail({ request, params });
}

export default function PortalSeminarFinanceDetailRoute({
  loaderData,
}: PortalSeminarFinanceDetailRouteProps) {
  return <PortalSeminarFinanceDetailRouteView loaderData={loaderData} />;
}
