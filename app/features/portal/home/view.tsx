import {
  ClipboardList,
  GraduationCap,
  Info,
  Music2,
  Users,
} from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { CopyIconButton } from "@/components/shared/copy-icon-button";
import {
  HomeAccessCard,
  type HomeAccessCardItem,
} from "@/components/shared/home-access-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { portalGrandFinalAlert } from "./grand-final-alert";
import type { PortalHomeLoaderData } from "./server";

export function PortalHomeRouteView({
  loaderData,
}: {
  loaderData: PortalHomeLoaderData;
}) {
  const grandFinalAlert = portalGrandFinalAlert(loaderData.grandFinal);

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
        {grandFinalAlert?.kind === "finalist" ? (
          <GrandFinalFinalistAlert voteUrl={grandFinalAlert.voteUrl} />
        ) : null}
        {grandFinalAlert?.kind === "eligible" ? (
          <GrandFinalEligibleAlert />
        ) : null}
        {grandFinalAlert?.kind === "invitation" ? (
          <GrandFinalInvitationAlert eventName={grandFinalAlert.eventName} />
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

/** No `Gran final` alert names a modality: eligibility is per modality, the alerts are not. */
function GrandFinalEligibleAlert() {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>
        Tu academia cumple los requisitos de la Gran final
      </AlertTitle>
      <AlertDescription>
        Los jurados pueden elegirla como finalista durante el evento.
      </AlertDescription>
    </Alert>
  );
}

function GrandFinalFinalistAlert({ voteUrl }: { voteUrl: string }) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>Tu academia es finalista de la Gran final</AlertTitle>
      <AlertDescription>
        <p>
          La votación del público está abierta. Compartí este enlace con tu
          comunidad para que voten:
        </p>
        <div className="flex items-center gap-1">
          <span
            className="min-w-0 truncate font-medium text-foreground"
            title={voteUrl}
          >
            {voteUrl}
          </span>
          <CopyIconButton label="enlace de votación" value={voteUrl} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

function GrandFinalInvitationAlert({ eventName }: { eventName: string }) {
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
