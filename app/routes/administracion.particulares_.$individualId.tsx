import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleIndividualDetailAction,
  loadIndividualDetail,
} from "@/features/admin/individuals/detail/server";
import type {
  IndividualDetailActionData,
  IndividualDetailLoaderData,
} from "@/features/admin/individuals/detail/shared";
import { IndividualDetailRouteView } from "@/features/admin/individuals/detail/view";
import { basePath } from "@/features/admin/individuals/shared";
import { toIndividualFullName } from "@/lib/individuals/personal-data";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.particulares_.$individualId";

type IndividualDetailRouteProps = {
  loaderData: IndividualDetailLoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Particular | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Particulares", to: basePath },
    (match) => {
      const data = match.loaderData as IndividualDetailLoaderData | undefined;
      return data ? { label: toIndividualFullName(data.individual) } : null;
    },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadIndividualDetail({ request, params });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<IndividualDetailActionData> {
  return await handleIndividualDetailAction({ request, params });
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function IndividualDetailRoute({
  loaderData,
}: IndividualDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <IndividualDetailRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
