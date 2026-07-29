import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeEventModality,
  loadAdminEventModalityCreate,
} from "@/features/admin/modalities/create/server";
import type { EventModalityActionData } from "@/features/admin/modalities/shared";
import { EventModalityCreateView } from "@/features/admin/modalities/create/view";

import type { Route } from "./+types/administracion.modalidades_.nueva";

type NewModalityRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: EventModalityActionData;
};

export const handle = {
  adminBreadcrumbs: [
    { label: "Modalidades", to: "/administracion/modalidades" },
    { label: "Nueva" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminEventModalityCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventModality(request);
}

export function NewModalityRouteView({
  loaderData,
  actionData,
}: NewModalityRouteProps) {
  return (
    <EventModalityCreateView loaderData={loaderData} actionData={actionData} />
  );
}

export default function NewModalityRoute({
  loaderData,
}: NewModalityRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewModalityRouteView loaderData={loaderData} actionData={actionData} />
  );
}
