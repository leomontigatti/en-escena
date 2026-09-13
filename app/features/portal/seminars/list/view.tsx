import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, ImageOff, Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { SubmitButton } from "@/components/shared/action-buttons";
import { ComboboxField } from "@/components/shared/combobox-field";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { WithdrawDialog } from "@/components/shared/withdraw-dialog";
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
  deletePortalSeminarInscriptionIntent,
  formatPortalSeminarMoment,
  getPortalSeminarClosedReason,
  registerPortalSeminarInscriptionIntent,
  registerPortalSeminarInscriptionSchema,
  toPortalSeminarPersonGroups,
  type PortalSeminarCard,
  type PortalSeminarInscription,
  type PortalSeminarsActionData,
  type PortalSeminarsListLoaderData,
  type RegisterPortalSeminarInscriptionFormValues,
} from "./shared";

export function PortalSeminarsListRouteView({
  actionData,
  loaderData,
}: {
  actionData?: PortalSeminarsActionData;
  loaderData: PortalSeminarsListLoaderData;
}) {
  const fetcher = useFetcher<PortalSeminarsActionData>();
  const [openSeminarId, setOpenSeminarId] = useState<string | null>(null);
  const [deletingInscriptionId, setDeletingInscriptionId] = useState<
    string | null
  >(null);
  const openSeminar =
    loaderData.seminars.find((seminar) => seminar.id === openSeminarId) ?? null;
  // The dialog reads its target from the loader rather than from a copy taken
  // when it opened, so the deleted chip closes it: once the row is gone the
  // seminar no longer lists it and there is nothing left to confirm.
  const deletingInscription = findInscription(
    loaderData.seminars,
    deletingInscriptionId,
  );

  useServerActionToast(actionData);
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
                onRemoveInscription={setDeletingInscriptionId}
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

      {deletingInscription ? (
        <RemovalDialog
          inscription={deletingInscription.inscription}
          instructorName={deletingInscription.instructorName}
          onClose={() => setDeletingInscriptionId(null)}
        />
      ) : null}
    </>
  );
}

/**
 * The academy's own removal, confirmed twice over. A row administration has
 * already put money on is not deleted but retired: it keeps that money and
 * frees its place, and registering the same person again brings both back. The
 * shared delete dialog cannot say that — it promises the removal is
 * irreversible — so a funded row gets the withdrawal dialog instead. No amount
 * is named: what a seminar costs is read in `Resumen financiero`.
 */
function RemovalDialog({
  inscription,
  instructorName,
  onClose,
}: {
  inscription: PortalSeminarInscription;
  instructorName: string;
  onClose: () => void;
}) {
  const onOpenChange = (nextOpen: boolean) => (nextOpen ? null : onClose());

  if (inscription.hasMoney) {
    return (
      <WithdrawDialog
        confirmLabel="Retirar inscripción"
        consequence="El dinero que la inscripción tiene asignado queda como está y su lugar se libera. Si volvés a inscribir a la persona, la inscripción vuelve con su dinero."
        description={`Esta inscripción ya tiene dinero asignado, así que no se borra: ${inscription.fullName} queda retirada del seminario de ${instructorName}.`}
        intentValue={deletePortalSeminarInscriptionIntent}
        onOpenChange={onOpenChange}
        open
        recordId={inscription.id}
        title={inscription.fullName}
      />
    );
  }

  return (
    <DeleteDialog
      title={inscription.fullName}
      description={`Esta acción da de baja la inscripción en el seminario de ${instructorName} y libera su lugar. No se puede deshacer.`}
      intentValue={deletePortalSeminarInscriptionIntent}
      recordId={inscription.id}
      open
      onOpenChange={onOpenChange}
    />
  );
}

function findInscription(
  seminars: PortalSeminarCard[],
  inscriptionId: string | null,
) {
  if (!inscriptionId) {
    return null;
  }

  for (const seminar of seminars) {
    const inscription = seminar.inscriptions.find(
      (candidate) => candidate.id === inscriptionId,
    );

    if (inscription) {
      return { inscription, instructorName: seminar.instructorName };
    }
  }

  return null;
}

function SeminarCardView({
  seminar,
  onOpenRegister,
  onRemoveInscription,
}: {
  seminar: PortalSeminarCard;
  onOpenRegister: () => void;
  onRemoveInscription: (inscriptionId: string) => void;
}) {
  const closedReason = getPortalSeminarClosedReason(seminar);

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
                <InscriptionChip
                  inscription={inscription}
                  onRemove={
                    // Once the seminar has started the chip loses its removal
                    // and keeps everything else, padding included: the row of
                    // chips must not shift when the window closes.
                    seminar.hasStarted
                      ? null
                      : () => onRemoveInscription(inscription.id)
                  }
                />
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

function InscriptionChip({
  inscription,
  onRemove,
}: {
  inscription: PortalSeminarInscription;
  onRemove: (() => void) | null;
}) {
  return (
    <Badge variant="outline" className="h-7 gap-1.5 pr-2.5">
      <UserRound aria-hidden="true" />
      {inscription.fullName}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Eliminar la inscripción de ${inscription.fullName}`}
          className="-mr-1.5 size-4"
          onClick={onRemove}
        >
          <X aria-hidden="true" data-icon />
        </Button>
      ) : null}
    </Badge>
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
  const form = useForm<RegisterPortalSeminarInscriptionFormValues>({
    resolver: zodResolver(registerPortalSeminarInscriptionSchema),
    defaultValues: { seminarId: seminar.id, person: "" },
  });
  const groups = toPortalSeminarPersonGroups(seminar.people);

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
          <DialogDescription>
            {formatPortalSeminarMoment(seminar)}
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          className="flex flex-col gap-5"
          onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
        >
          <input
            type="hidden"
            name="intent"
            value={registerPortalSeminarInscriptionIntent}
          />
          <input type="hidden" name="seminarId" value={seminar.id} />
          <FieldGroup>
            <ComboboxField
              control={form.control}
              emptyMessage="No hay nadie con ese nombre."
              inputPlaceholder="Buscar por nombre"
              label="Persona"
              name="person"
              groups={groups}
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
