import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeEventModality,
  loadAdministrativeEventModalityCreate,
} from "@/features/admin/modalities/create/server";
import type { AdministrativeEventModalityActionData } from "@/features/admin/modalities/shared";
import { AdministrativeEventModalityCreateView } from "@/features/admin/modalities/create/view";

import type { Route } from "./+types/administracion.modalidades_.nueva";

type AdministracionModalidadNuevaRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: AdministrativeEventModalityActionData;
};

export const handle = {
  adminBreadcrumbs: [
    { label: "Modalidades", to: "/administracion/modalidades" },
    { label: "Nueva" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventModalityCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventModality(request);
}

export function AdministracionModalidadNuevaRouteView({
  loaderData,
  actionData,
}: AdministracionModalidadNuevaRouteProps) {
  return (
    <AdministrativeEventModalityCreateView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function AdministracionModalidadNuevaRoute({
  loaderData,
}: AdministracionModalidadNuevaRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionModalidadNuevaRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
