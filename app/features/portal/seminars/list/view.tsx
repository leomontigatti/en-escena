import { CalendarClock, ImageOff } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  formatPortalSeminarInscriptionCount,
  formatPortalSeminarMoment,
  portalSeminarDetailPath,
} from "../shared";
import type { PortalSeminarCard, PortalSeminarsListLoaderData } from "./shared";

export function PortalSeminarsListRouteView({
  loaderData,
}: {
  loaderData: PortalSeminarsListLoaderData;
}) {
  return (
    <PortalListPage
      titleId="seminarios-title"
      title="Seminarios"
      description="Inscribí a los bailarines y profesores de tu academia en los seminarios del evento activo. Cada inscripción toma su lugar cuando administración registra su seña."
    >
      {loaderData.hasActiveEvent && loaderData.seminars.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loaderData.seminars.map((seminar) => (
            <SeminarCardView key={seminar.id} seminar={seminar} />
          ))}
        </div>
      ) : (
        <PortalEmptyState
          title={
            loaderData.hasActiveEvent
              ? "Todavía no hay seminarios"
              : "No hay un evento activo"
          }
          description={
            loaderData.hasActiveEvent
              ? "Cuando la organización publique los seminarios de este evento vas a poder inscribir a tu gente desde acá."
              : "Cuando la organización active un evento vas a ver acá sus seminarios."
          }
        />
      )}
    </PortalListPage>
  );
}

/**
 * A poster and nothing else: the instructor, the moment, how many the academy
 * has registered and one way in. There is no state on it — no closed reason, no
 * occupancy, no money — so a started seminar's card reads exactly like an open
 * one, and everything that changes lives one click away on the detail.
 */
function SeminarCardView({ seminar }: { seminar: PortalSeminarCard }) {
  return (
    <Card className="group overflow-hidden">
      {/* `overflow-hidden` is repeated here rather than left to the card: the
          hover zoom scales the image past the frame, and the band's own bottom
          border is what has to clip it. */}
      <div className="flex h-56 items-center justify-center overflow-hidden border-b bg-muted text-muted-foreground">
        {seminar.instructorPictureUrl ? (
          <img
            src={seminar.instructorPictureUrl}
            alt={seminar.instructorName}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
          />
        ) : (
          <ImageOff aria-hidden="true" className="size-8" />
        )}
      </div>

      <CardHeader>
        <CardTitle>{seminar.instructorName}</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          {formatPortalSeminarMoment(seminar)}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {formatPortalSeminarInscriptionCount(seminar.inscriptionCount)}
          </Badge>
        </CardAction>
      </CardHeader>

      {/* Pinned to the bottom so every card in a row measures the same. */}
      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        <Button asChild variant="outline">
          <Link to={portalSeminarDetailPath(seminar.id)}>Ver detalle</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
