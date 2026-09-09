import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, ImageOff, Plus, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { SubmitButton } from "@/components/shared/action-buttons";
import { ComboboxField } from "@/components/shared/combobox-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { createValidatedRouteFormDataSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  formatSeminarMoment,
  getSeminarClosedReason,
  getSeminarPersonKindLabel,
  registerSeminarInscriptionIntent,
  registerSeminarInscriptionSchema,
  toSeminarPersonValue,
  type PortalSeminarCard,
  type PortalSeminarsActionData,
  type PortalSeminarsListLoaderData,
  type RegisterSeminarInscriptionFormValues,
} from "./shared";

export function PortalSeminarsListRouteView({
  loaderData,
}: {
  loaderData: PortalSeminarsListLoaderData;
}) {
  const fetcher = useFetcher<PortalSeminarsActionData>();
  const [openSeminarId, setOpenSeminarId] = useState<string | null>(null);
  const openSeminar =
    loaderData.seminars.find((seminar) => seminar.id === openSeminarId) ?? null;

  useServerActionToast(fetcher.data);

  // The dialog stays mounted while the row is in flight so a refusal keeps the
  // picked person on screen; it closes only once the server accepted.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.status === "success") {
      setOpenSeminarId(null);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <>
      <PortalListPage
        titleId="seminarios-title"
        title="Seminarios"
        description="Inscribí a los bailarines y profesores de tu academia en los seminarios del evento activo. Los lugares son por orden de inscripción."
      >
        {loaderData.hasActiveEvent && loaderData.seminars.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {loaderData.seminars.map((seminar) => (
              <SeminarCardView
                key={seminar.id}
                seminar={seminar}
                onOpenRegister={() => setOpenSeminarId(seminar.id)}
              />
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

      {openSeminar ? (
        <RegisterInscriptionDialog
          isSubmitting={fetcher.state !== "idle"}
          onClose={() => setOpenSeminarId(null)}
          seminar={openSeminar}
          submit={fetcher.submit}
        />
      ) : null}
    </>
  );
}

function SeminarCardView({
  seminar,
  onOpenRegister,
}: {
  seminar: PortalSeminarCard;
  onOpenRegister: () => void;
}) {
  const closedReason = getSeminarClosedReason(seminar);

  return (
    <Card className="overflow-hidden">
      <div className="flex h-40 items-center justify-center border-b bg-muted text-muted-foreground">
        {seminar.instructorPictureUrl ? (
          <img
            src={seminar.instructorPictureUrl}
            alt={seminar.instructorName}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageOff aria-hidden="true" className="size-8" />
        )}
      </div>

      <CardHeader>
        <CardTitle>{seminar.instructorName}</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          {formatSeminarMoment(seminar)}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {seminar.inscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no inscribiste a nadie.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {seminar.inscriptions.map((inscription) => (
              <li key={inscription.id}>
                <Badge variant="outline" className="h-7 gap-1.5 pr-2.5">
                  <UserRound aria-hidden="true" />
                  {inscription.fullName}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Pinned to the bottom so every card in a row measures the same, and
          holding either the button or its one-sentence replacement: a disabled
          button would say the same thing without saying why. */}
      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        {closedReason ? (
          <p className="flex h-8 items-center justify-center text-center text-xs text-muted-foreground">
            {closedReason}
          </p>
        ) : (
          <Button type="button" onClick={onOpenRegister}>
            <Plus aria-hidden="true" data-icon />
            Inscribir
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function RegisterInscriptionDialog({
  isSubmitting,
  onClose,
  seminar,
  submit,
}: {
  isSubmitting: boolean;
  onClose: () => void;
  seminar: PortalSeminarCard;
  submit: ReturnType<typeof useFetcher>["submit"];
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const form = useForm<RegisterSeminarInscriptionFormValues>({
    resolver: zodResolver(registerSeminarInscriptionSchema),
    defaultValues: { seminarId: seminar.id, person: "" },
  });
  const options = seminar.people.map((person) => ({
    value: toSeminarPersonValue(person),
    label: `${person.fullName} · ${getSeminarPersonKindLabel(person.kind)}`,
  }));

  return (
    <Dialog open onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
      <DialogContent
        ref={contentRef}
        overlayClassName="backdrop-blur-sm"
        onOpenAutoFocus={(event) => {
          // `ComboboxField` puts the field id on its search input, which only
          // exists once the popup is open, so the trigger is what takes focus.
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLElement>('[data-slot="combobox-trigger"]')
            ?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{seminar.instructorName}</DialogTitle>
          <DialogDescription>{formatSeminarMoment(seminar)}</DialogDescription>
        </DialogHeader>

        <form
          method="post"
          className="flex flex-col gap-5"
          onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
        >
          <input
            type="hidden"
            name="intent"
            value={registerSeminarInscriptionIntent}
          />
          <input type="hidden" name="seminarId" value={seminar.id} />
          <FieldGroup>
            <ComboboxField
              control={form.control}
              emptyMessage="No hay nadie con ese nombre."
              inputPlaceholder="Buscar por nombre"
              label="Persona"
              name="person"
              options={options}
              placeholder="Elegí una persona del plantel"
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton isPending={isSubmitting} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
