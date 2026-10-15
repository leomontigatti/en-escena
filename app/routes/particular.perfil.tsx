import {
  handleIndividualPersonalDataAction,
  loadIndividualPersonalData,
} from "@/features/individual/personal-data/server";
import { IndividualPersonalDataRouteView } from "@/features/individual/personal-data/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/particular.perfil";

export const meta: Route.MetaFunction = () => [
  { title: "Perfil | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Perfil",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualPersonalData(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleIndividualPersonalDataAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function IndividualPersonalDataRoute({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  return (
    <IndividualPersonalDataRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
