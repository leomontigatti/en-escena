import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalListPage } from "@/components/portal/ui";
import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { ComboboxField } from "@/components/shared/combobox-field";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { WithdrawDialog } from "@/components/shared/withdraw-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 * one flat table, the name as its only row action — and it says nothing about
 * money: what a seminar costs is read in `Resumen financiero`.
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
        titleId="seminario-title"
        title={seminar.instructorName}
        description={formatPortalSeminarMoment(seminar)}
        action={
          closedReason ? null : (
            <Button type="button" onClick={() => setIsRegistering(true)}>
              <Plus aria-hidden="true" data-icon />
              Inscribir
            </Button>
          )
        }
      >
        <AlertStack>
          {closedReason ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
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
              <AlertDescription>
                Cupo completo: podés inscribir igual, pero la seña de una nueva
                inscripción no se cubre hasta que se libere un lugar.
              </AlertDescription>
            </Alert>
          ) : null}
        </AlertStack>

        <InscriptionsTable
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
          {inscription.personKind === "professor" ? "Profesor" : "Bailarín"}
        </Badge>
      ),
    },
  ];

  return (
    <ClientDataTable
      rows={inscriptions}
      columns={columns}
      getRowKey={(inscription) => inscription.id}
      searchPlaceholder="Buscar inscripto por nombre"
      emptyMessage="Todavía no inscribiste a nadie en este seminario."
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
        confirmLabel="Retirar inscripción"
        consequence="El dinero que la inscripción tiene asignado queda como está y, si ya tenía la seña cubierta, su lugar se libera. Si volvés a inscribir a la persona, la inscripción vuelve con su dinero."
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
