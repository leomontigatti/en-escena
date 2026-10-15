import { AccountKindRouteView } from "@/features/individual/onboarding/account-kind-view";
import { loadPendingOnboarding } from "@/features/individual/onboarding/server";

import type { Route } from "./+types/registro_.cuenta";

export const meta: Route.MetaFunction = () => [
  { title: "Elegir tipo de cuenta | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPendingOnboarding(request);
}

export default function AccountKindRoute() {
  return <AccountKindRouteView />;
}
