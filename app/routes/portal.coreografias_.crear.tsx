import { useLoaderData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { PrototypeWizard } from "@/features/portal/choreographies/create/prototype-wizard";
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

// PROTOTYPE: renders the throwaway full-page wizard.
export default function PortalCoreografiasCreateRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <PrototypeWizard
      baseOptions={data.registrationBaseOptions}
      dancers={data.activeDancers}
      professors={data.activeProfessors}
    />
  );
}
