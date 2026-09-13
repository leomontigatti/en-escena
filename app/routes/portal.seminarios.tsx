import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalSeminarsList } from "@/features/portal/seminars/list/server";
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

export default function PortalSeminarsRoute({
  loaderData,
}: PortalSeminarsListRouteProps) {
  return <PortalSeminarsListRouteView loaderData={loaderData} />;
}
