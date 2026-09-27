import { useLoaderData, useSearchParams } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { PrototypeRosterStep } from "@/features/portal/choreographies/create/prototype-roster-step";
import { loadCreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    { label: "Nueva" },
  ],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadCreateChoreographyRouteData(request);
}

// PROTOTYPE: renders the throwaway dancers-step variants.
export default function PortalCoreografiasCreateRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  return (
    <PrototypeRosterStep
      dancers={data.activeDancers}
      variant={searchParams.get("variant") ?? "A"}
    />
  );
}
