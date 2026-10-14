import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { ComboboxField } from "@/components/shared/combobox-field";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { WithdrawDialog } from "@/components/shared/withdraw-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { rosterPersonNoun } from "@/lib/roster/roster-person-kind.shared";
import {
  Dialog,
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
  type PortalSeminarPersonOption,
  type RegisterPortalSeminarInscriptionFormValues,
} from "../shared";
import type {
  PortalSeminarDetailActionData,
  PortalSeminarDetailInscription,
  PortalSeminarDetailLoaderData,
  PortalSeminarDetailSeminar,
} from "./shared";

/**
 * The academy's own half of a seminar: who it registered, and the two gestures
 * the poster card gave up. It reads like administration's `Inscriptos` tab —
 * one flat table, the name as its only row action. Of the money it says only
 * each row's `Estado`, which is what tells a reserved place from one that
 * lapsed; what a seminar costs is read in `Resumen financiero`.
 */
export function PortalSeminarDetailRouteView({
  actionData,
  loaderData,
}: {
  actionData?: PortalSeminarDetailActionData;
  loaderData: PortalSeminarDetailLoaderData;
}) {
  const fetcher = useFetcher<PortalSeminarDetailActionData>();
  const [isRegistering, setIsRegistering] = useState(false);
  const [removingInscriptionId, setRemovingInscriptionId] = useState<
    string | null
  >(null);
  const { seminar } = loaderData;
  const closedReason = getPortalSeminarClosedReason(seminar);
  // The dialog reads its target from the loader rather than from a copy taken
  // when it opened, so a removed row closes it: once the row is gone the
  // seminar no longer lists it and there is nothing left to confirm.
  const removingInscription =
    loaderData.inscriptions.find(
      (inscription) => inscription.id === removingInscriptionId,
    ) ?? null;

  useServerActionToast(actionData);
  useServerActionToast(fetcher.data);

  // The dialog stays mounted while the row is in flight so a refusal keeps the
  // picked person on screen; it closes only once the server accepted.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.status === "success") {
      setIsRegistering(false);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <>
      <PortalListPage
        titleId="seminar-title"
        title={seminar.instructorName}
        description={formatPortalSeminarMoment(seminar)}
        action={
          closedReason ? null : (
            <Button type="button" onClick={() => setIsRegistering(true)}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              Inscribir
            </Button>
          )
        }
      >
        <AlertStack>
          {closedReason ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Inscripciones cerradas</AlertTitle>
              <AlertDescription>
                {seminar.hasStarted
                  ? `${closedReason} Ya no se puede inscribir ni dar de baja.`
                  : closedReason}
              </AlertDescription>
            </Alert>
          ) : null}
          {/* A full seminar closes nothing: the quota is spent by deposits, so
              the academy is told what would happen rather than stopped. */}
          {seminar.isFull && !seminar.hasStarted ? (
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>Cupo completo</AlertTitle>
              <AlertDescription>
                Podés inscribir igual, pero la seña de una nueva inscripción no
                se cubre hasta que se libere un lugar.
              </AlertDescription>
            </Alert>
          ) : null}
        </AlertStack>

        <InscriptionsSection
          isClosed={closedReason !== null}
          canRemove={!seminar.hasStarted}
          inscriptions={loaderData.inscriptions}
          onRemove={setRemovingInscriptionId}
        />
      </PortalListPage>

      {isRegistering ? (
        <RegisterInscriptionDialog
          isSubmitting={fetcher.state !== "idle"}
          onClose={() => setIsRegistering(false)}
          people={loaderData.people}
          seminar={seminar}
          submit={fetcher.submit}
        />
      ) : null}

      {removingInscription ? (
        <RemovalDialog
          inscription={removingInscription}
          instructorName={seminar.instructorName}
          onClose={() => setRemovingInscriptionId(null)}
        />
      ) : null}
    </>
  );
}

/** The table, or the portal empty state while the academy has nobody in. */
function InscriptionsSection({
  isClosed,
  ...table
}: {
  canRemove: boolean;
  inscriptions: PortalSeminarDetailInscription[];
  isClosed: boolean;
  onRemove: (inscriptionId: string) => void;
}) {
  if (table.inscriptions.length > 0) {
    return <InscriptionsTable {...table} />;
  }

  return (
    <PortalEmptyState
      title="Todavía no inscribiste a nadie"
      description={
        isClosed
          ? "Este seminario ya no recibe inscripciones."
          : "Usá Inscribir para sumar a alguien de tu plantel."
      }
    />
  );
}

function InscriptionsTable({
  canRemove,
  inscriptions,
  onRemove,
}: {
  canRemove: boolean;
  inscriptions: PortalSeminarDetailInscription[];
  onRemove: (inscriptionId: string) => void;
}) {
  const columns: DataTableColumn<PortalSeminarDetailInscription>[] = [
    {
      id: "fullName",
      header: "Nombre",
      className: "min-w-56 font-medium",
      // The name is the only action on a row, as on the admin table. Once the
      // seminar has started it is plain text: there is nothing left to do.
      cell: (inscription) =>
        canRemove ? (
          <Button
            variant="link"
            className="h-auto p-0 font-medium"
            onClick={() => onRemove(inscription.id)}
          >
            {inscription.fullName}
          </Button>
        ) : (
          inscription.fullName
        ),
      filterValue: (inscription) => inscription.fullName,
      sortValue: (inscription) => inscription.fullName,
    },
    {
      id: "personKind",
      header: "Tipo",
      cell: (inscription) => (
        <Badge variant="secondary">
          {rosterPersonNoun(inscription.personKind, "singularCapitalized")}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Estado",
      cell: (inscription) => (
        <FinancialStatusBadge status={inscription.status} />
      ),
    },
  ];

  return (
    <ClientDataTable
      rows={inscriptions}
      columns={columns}
      getRowKey={(inscription) => inscription.id}
      searchPlaceholder="Buscar por nombre"
      initialSort={{ columnId: "fullName", direction: "asc" }}
    />
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
  inscription: PortalSeminarDetailInscription;
  instructorName: string;
  onClose: () => void;
}) {
  const onOpenChange = (nextOpen: boolean) => (nextOpen ? null : onClose());

  if (inscription.hasMoney) {
    return (
      <WithdrawDialog
        confirmLabel="Retirar"
        consequence="El dinero que la inscripción tiene asignado queda como está y, si ya tenía la seña cubierta, su lugar se libera. El retiro es definitivo: si volvés a inscribir a la persona, se crea una inscripción nueva, sin dinero."
        description={`Esta inscripción ya tiene dinero asignado, así que no se borra: ${inscription.fullName} queda retirada del seminario de ${instructorName}.`}
        intentValue={deletePortalSeminarInscriptionIntent}
        onOpenChange={onOpenChange}
        open
        recordId={inscription.id}
        title="¿Retirar la inscripción?"
      />
    );
  }

  return (
    <DeleteDialog
      title="¿Eliminar la inscripción?"
      description={`Esta acción da de baja la inscripción de ${inscription.fullName} en el seminario de ${instructorName} y libera su lugar.`}
      intentValue={deletePortalSeminarInscriptionIntent}
      recordId={inscription.id}
      open
      onOpenChange={onOpenChange}
    />
  );
}

function RegisterInscriptionDialog({
  isSubmitting,
  onClose,
  people,
  seminar,
  submit,
}: {
  isSubmitting: boolean;
  onClose: () => void;
  people: PortalSeminarPersonOption[];
  seminar: PortalSeminarDetailSeminar;
  submit: ReturnType<typeof useFetcher>["submit"];
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const form = useForm<RegisterPortalSeminarInscriptionFormValues>({
    resolver: zodResolver(registerPortalSeminarInscriptionSchema),
    defaultValues: { seminarId: seminar.id, person: "" },
  });
  const groups = toPortalSeminarPersonGroups(people);

  // The only thing the dialog holds is a pick from the roster, with no typed
  // text to lose, so closing it never asks.
  return (
    <Dialog open onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
      <DialogContent
        ref={contentRef}
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
          {/* Only a registration that gets a place reserves it, so a full
              seminar promises no deadline: the page's `Cupo completo` says
              what happens instead. */}
          {seminar.isFull ? null : (
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>Reserva de lugar</AlertTitle>
              <AlertDescription>
                {seminar.startsBeforePaymentDeadline
                  ? "Tenés hasta que empiece el seminario para enviar el pago de la seña. Si no lo enviás en ese plazo, la inscripción pierde su lugar."
                  : "Tenés 48 horas para enviar el pago de la seña. Si no lo enviás en ese plazo, la inscripción pierde su lugar."}
              </AlertDescription>
            </Alert>
          )}
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
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <SubmitButton
              disabled={form.watch("person") === ""}
              isPending={isSubmitting}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
