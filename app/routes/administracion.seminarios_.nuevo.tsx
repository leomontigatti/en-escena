import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeSeminar,
  loadSeminarCreate,
} from "@/features/admin/seminars/create/server";
import {
  SeminarCreateView,
  type SeminarCreateViewProps,
} from "@/features/admin/seminars/create/view";

import type { Route } from "./+types/administracion.seminarios_.nuevo";

export const handle = {
  adminBreadcrumbs: [
    { label: "Seminarios", to: "/administracion/seminarios" },
    { label: "Nuevo seminario" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadSeminarCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeSeminar(request);
}

export function NewSeminarRouteView({
  loaderData,
  actionData,
}: SeminarCreateViewProps) {
  return <SeminarCreateView loaderData={loaderData} actionData={actionData} />;
}

export default function NewSeminarRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewSeminarRouteView loaderData={loaderData} actionData={actionData} />
  );
}
