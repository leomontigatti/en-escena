import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleMovementCreateAction,
  loadMovementCreate,
} from "@/features/admin/payments/create/server";
import { NewMovementRouteView } from "@/features/admin/payments/create/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.movimientos_.nuevo";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;

type NewMovementRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Nuevo movimiento | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Movimientos", to: "/administracion/movimientos" },
    { label: "Nuevo movimiento" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadMovementCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleMovementCreateAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function NewMovementRoute({
  loaderData,
}: NewMovementRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewMovementRouteView actionData={actionData} loaderData={loaderData} />
  );
}
