// PROTOTYPE (#223) — throwaway, never merge. Three variants of the judge's live
// scoring flow (assigned list, score dialog with auto-advance, acrobatics
// sheet) on the existing `/juzgamiento` route, switchable via `?variant=`.
// The question: does it work on a tablet held in a dark theatre, mid-show?

import { Switch } from "@/components/ui/switch";
import {
  PrototypeSwitcher,
  usePrototypeVariant,
  type PrototypeVariant,
} from "@/components/shared/prototype-switcher";
import { useDarkTheme } from "@/features/judging/prototype/chrome";
import {
  countScored,
  useJudgingPrototypeStore,
} from "@/features/judging/prototype/shared";
import { VariantA } from "@/features/judging/prototype/variant-a";
import { VariantB } from "@/features/judging/prototype/variant-b";
import { VariantC } from "@/features/judging/prototype/variant-c";
import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/juzgamiento";

type JuzgamientoRouteProps = Pick<Route.ComponentProps, "loaderData">;

const variants: PrototypeVariant[] = [
  { key: "A", name: "Tabla y diálogo" },
  { key: "B", name: "Siguiente al frente" },
  { key: "C", name: "Lista y panel" },
];

export const meta: Route.MetaFunction = () => [
  { title: "Panel de juzgamiento | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireJudgePanelUser(request);

  return { email: user.email };
}

export function JuzgamientoRouteView({ loaderData }: JuzgamientoRouteProps) {
  const variant = usePrototypeVariant(variants);
  const store = useJudgingPrototypeStore();
  const { isDark, setIsDark } = useDarkTheme();
  const variantProps = {
    email: loaderData.email,
    isDark,
    onDarkChange: setIsDark,
    store,
  };

  return (
    <>
      {variant === "A" ? <VariantA {...variantProps} /> : null}
      {variant === "B" ? <VariantB {...variantProps} /> : null}
      {variant === "C" ? <VariantC {...variantProps} /> : null}
      <PrototypeSwitcher variants={variants} current={variant}>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {countScored(store)}/{store.assignments.length}
        </span>
        <label className="flex items-center gap-2 pr-2 text-xs whitespace-nowrap">
          <Switch
            size="sm"
            checked={store.failSaves}
            onCheckedChange={store.setFailSaves}
          />
          Fallar guardado
        </label>
      </PrototypeSwitcher>
    </>
  );
}

export default JuzgamientoRouteView;
