import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { createAdministrativeEvent } from "@/features/admin/events/create/server";
import type { EventCreateActionData } from "@/features/admin/events/create/shared";
import { AdministrativeEventCreateView } from "@/features/admin/events/create/view";

import type { Route } from "./+types/administracion.eventos_.nuevo";

type NewEventRouteProps = {
  actionData?: EventCreateActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Crear Evento | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Eventos", to: "/administracion/eventos" },
    { label: "Nuevo" },
  ],
} satisfies AdminRouteHandle;

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEvent(request);
}

export function NewEventRouteView({ actionData }: NewEventRouteProps) {
  return <AdministrativeEventCreateView actionData={actionData} />;
}

export default function NewEventRoute() {
  const actionData = useActionData<typeof action>();

  return <NewEventRouteView actionData={actionData} />;
}
