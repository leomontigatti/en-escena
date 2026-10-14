import {
  handleIndividualPersonalDataAction,
  loadIndividualPersonalData,
} from "@/features/individual/personal-data/server";
import { IndividualPersonalDataRouteView } from "@/features/individual/personal-data/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/particular.mis-datos";

export const meta: Route.MetaFunction = () => [
  { title: "Mis datos | Particular | En Escena" },
];

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
