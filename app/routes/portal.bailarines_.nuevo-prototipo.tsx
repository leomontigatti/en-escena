// PROTOTYPE — throwaway. Full-page "Nuevo bailarín" for the design review;
// deleted before implementation. Nothing is saved: the form only shows what it
// would post.
import type { PortalRouteHandle } from "@/components/portal/ui";
import { DancerCreatePrototype } from "@/features/portal/dancers/create/prototype";
import { findActiveEventStartDateOnly } from "@/lib/events/active-event.server";

import type { Route } from "./+types/portal.bailarines_.nuevo-prototipo";

export const meta = () => [
  { title: "Nuevo bailarín (prototipo) | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Bailarines", to: "/portal/bailarines" },
    { label: "Nuevo bailarín" },
  ],
} satisfies PortalRouteHandle;

export async function loader() {
  return { eventStartDate: await findActiveEventStartDateOnly() };
}

export default function PortalDancerCreatePrototypeRoute({
  loaderData,
}: Route.ComponentProps) {
  return <DancerCreatePrototype eventStartDate={loaderData.eventStartDate} />;
}
