import { JudgePanelView } from "@/features/judging/list/view";
import { loadJudgePanelRouteData } from "@/features/judging/list/server";

import type { Route } from "./+types/juzgamiento";

export const meta: Route.MetaFunction = () => [
  { title: "Panel de juzgamiento | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadJudgePanelRouteData(request);
}

export const JuzgamientoRouteView = JudgePanelView;

export default JuzgamientoRouteView;
