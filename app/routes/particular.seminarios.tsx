import { useActionData } from "react-router";

import {
  handleIndividualSeminarsAction,
  loadIndividualSeminars,
} from "@/features/individual/seminars/server";
import { IndividualSeminarsView } from "@/features/individual/seminars/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/particular.seminarios";

export const meta: Route.MetaFunction = () => [
  { title: "Seminarios | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Seminarios",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualSeminars(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleIndividualSeminarsAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function IndividualSeminarsRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <IndividualSeminarsView actionData={actionData} loaderData={loaderData} />
  );
}
