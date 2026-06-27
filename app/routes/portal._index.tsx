import { GraduationCap, Music2, Users } from "lucide-react";

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  HomeAccessCard,
  type HomeAccessCardItem,
} from "@/components/shared/home-access-card";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/portal._index";

export const handle = {
  portalBreadcrumbs: [{ label: "Inicio" }],
} satisfies PortalRouteHandle;

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAcademyUser(request);
  return null;
}

function PortalIndexRouteView() {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          ¡Bienvenido al portal de academias!
        </h1>
        <p className="text-sm text-muted-foreground">
          Desde acá vas a poder gestionar todos los datos referidos a tu
          academia para participar del evento.
        </p>
      </section>

      <section
        className="grid gap-4 sm:grid-cols-2"
        aria-label="Accesos del portal"
      >
        {portalHomeCards.map((card) => (
          <HomeAccessCard key={card.to} item={card} />
        ))}
      </section>
    </>
  );
}

const portalHomeCards = [
  {
    title: "Profesores",
    description: "Gestioná los profesores de tu academia.",
    icon: GraduationCap,
    to: "/portal/profesores",
  },
  {
    title: "Bailarines",
    description: "Gestioná los bailarines de tu academia.",
    icon: Users,
    to: "/portal/bailarines",
  },
  {
    title: "Coreografías",
    description: "Creá y revisá las coreografías del evento activo.",
    icon: Music2,
    to: "/portal/coreografias",
  },
] satisfies HomeAccessCardItem[];

export default PortalIndexRouteView;
