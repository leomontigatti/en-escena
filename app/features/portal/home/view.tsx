import {
  CircleCheck,
  ClipboardList,
  GraduationCap,
  Info,
  Music2,
  Users,
} from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import {
  HomeAccessCard,
  type HomeAccessCardItem,
} from "@/components/shared/home-access-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { PortalHomeLoaderData } from "./server";

export function PortalHomeRouteView({
  loaderData,
}: {
  loaderData: PortalHomeLoaderData;
}) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          ¡Bienvenido al portal de academias!
        </h2>
        <p className="text-sm text-muted-foreground">
          Desde acá vas a poder gestionar todos los datos referidos a tu
          academia para participar del evento.
        </p>
      </section>

      <AlertStack>
        {loaderData.grandFinal ? (
          <PortalGrandFinalAlert {...loaderData.grandFinal} />
        ) : null}
      </AlertStack>

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

/**
 * At most one `Gran final` alert, by precedence: an eligible academy reads that
 * it meets the requirements; any other one is invited, but only while some
 * schedule takes inscriptions, since that is the only time it can still
 * qualify. Neither names a modality.
 */
function PortalGrandFinalAlert({
  eventName,
  isEligible,
  isRegistrationOpen,
}: NonNullable<PortalHomeLoaderData["grandFinal"]>) {
  if (isEligible) {
    return (
      <Alert variant="success">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>
          Tu academia cumple los requisitos de la Gran final
        </AlertTitle>
        <AlertDescription>
          Los jurados pueden elegirla como finalista durante el evento.
        </AlertDescription>
      </Alert>
    );
  }

  if (!isRegistrationOpen) {
    return null;
  }

  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>Participá de la Gran final de {eventName}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          <li>
            Al menos una coreografía grupal en una categoría Baby o Infantil.
          </li>
          <li>
            Al menos una coreografía grupal en una categoría Juvenil, Mayores o
            Adultos.
          </li>
          <li>Las dos en la misma modalidad.</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}

const portalHomeCards = [
  {
    title: "Resumen",
    description: "Consultá el estado de tu cuenta corriente dentro del evento.",
    icon: ClipboardList,
    to: "/portal/finanzas",
  },
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
