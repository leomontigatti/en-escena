import { loadCreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";

export async function loader({ request }: { request: Request }) {
  return await loadCreateChoreographyRouteData(request);
}

export default function PortalCoreografiasCreateRoute() {
  return null;
}
