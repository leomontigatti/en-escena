// PROTOTYPE (#223) — throwaway, never merge. The judge's live scoring flow
// (assigned list, score dialog with auto-advance, acrobatics sheet) on the
// existing `/juzgamiento` route, over in-memory fixtures.
// The question: does it work on a tablet held in a dark theatre, mid-show?

import { Switch } from "@/components/ui/switch";
import {
  countScored,
  useJudgingPrototypeStore,
} from "@/features/judging/prototype/shared";
import { JudgingPrototype } from "@/features/judging/prototype/judging-prototype";
import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/juzgamiento";

type JuzgamientoRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Panel de juzgamiento | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireJudgePanelUser(request);

  return { email: user.email };
}

export function JuzgamientoRouteView({ loaderData }: JuzgamientoRouteProps) {
  const store = useJudgingPrototypeStore();

  return (
    <>
      <JudgingPrototype email={loaderData.email} store={store} />
      {import.meta.env.PROD ? null : (
        // Prototype-only controls, never part of the design.
        <div className="dark fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background px-4 py-2 text-foreground shadow-lg">
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {countScored(store)}/{store.assignments.length}
          </span>
          <label className="flex items-center gap-2 text-xs whitespace-nowrap">
            <Switch
              size="sm"
              checked={store.failSaves}
              onCheckedChange={store.setFailSaves}
            />
            Fallar guardado
          </label>
        </div>
      )}
    </>
  );
}

export default JuzgamientoRouteView;
