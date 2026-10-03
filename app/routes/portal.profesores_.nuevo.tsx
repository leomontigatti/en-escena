import type { ShouldRevalidateFunction } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { CreateProfessorPage } from "@/features/portal/professors/create/page";
import {
  handlePortalProfessorCreateAction,
  loadPortalProfessorCreate,
} from "@/features/portal/professors/create/server";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.profesores_.nuevo";

export const meta = () => [
  { title: "Nuevo profesor | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Profesores", to: "/portal/profesores" },
    { label: "Nuevo profesor" },
  ],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalProfessorCreate(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalProfessorCreateAction(request);
}

// A refusal comes back as data and changes nothing the loader reads, and a
// save leaves the page.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  defaultShouldRevalidate,
  formMethod,
}) => (formMethod ? false : defaultShouldRevalidate);

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function PortalProfesoresCreateRoute({
  actionData,
}: Route.ComponentProps) {
  return <CreateProfessorPage actionData={actionData} />;
}
