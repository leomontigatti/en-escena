import {
  handleIndividualOnboardingAction,
  loadPendingOnboarding,
} from "@/features/individual/onboarding/server";
import { IndividualOnboardingRouteView } from "@/features/individual/onboarding/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/registro_.particular";

export const meta: Route.MetaFunction = () => [
  { title: "Completar cuenta de Particular | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPendingOnboarding(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleIndividualOnboardingAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function IndividualOnboardingRoute({
  actionData,
}: Route.ComponentProps) {
  return <IndividualOnboardingRouteView actionData={actionData} />;
}
