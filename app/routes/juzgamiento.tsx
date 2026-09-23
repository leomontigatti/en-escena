import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/auth/access-ui";
import { buildInternalAccount } from "@/lib/auth/internal-account";
import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/juzgamiento";

type JuzgamientoRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Panel de juzgamiento | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireJudgePanelUser(request);

  return { account: buildInternalAccount(user) };
}

export function JuzgamientoRouteView({ loaderData }: JuzgamientoRouteProps) {
  return (
    <AccessPage width="xl">
      <PrivateAccessHeader account={loaderData.account} />
      <AccessHeader
        eyebrow="Juzgamiento"
        title="Panel de evaluación"
        description={
          <>
            Las presentaciones asignadas y la carga de puntajes y devoluciones
            se van a construir en próximas iteraciones.
          </>
        }
      />

      <div className="mt-8 rounded-lg bg-muted p-5">
        <p className="text-sm font-semibold text-foreground">
          Presentaciones asignadas
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Todavía no hay una lista de evaluación disponible para este usuario.
        </p>
      </div>
    </AccessPage>
  );
}

export default JuzgamientoRouteView;
