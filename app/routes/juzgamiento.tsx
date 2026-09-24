import { useActionData } from "react-router";

import { JudgePanelView } from "@/features/judging/list/view";
import { loadJudgePanelRouteData } from "@/features/judging/list/server";
import { handleJudgePanelAction } from "@/features/judging/score/action.server";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/juzgamiento";

export const meta: Route.MetaFunction = () => [
  { title: "Panel de juzgamiento | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadJudgePanelRouteData(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleJudgePanelAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export const JuzgamientoRouteView = JudgePanelView;

export default function JuzgamientoRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return <JudgePanelView actionData={actionData} loaderData={loaderData} />;
}
