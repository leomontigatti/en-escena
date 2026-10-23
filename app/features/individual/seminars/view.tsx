import { Check, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { PortalInscriptionPrice } from "@/components/portal/inscription-price";
import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { WithdrawDialog } from "@/components/shared/withdraw-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatAmount } from "@/lib/finances/formatters";
import {
  registeredByAcademyMessage,
  seminarPricesMissingMessage,
  seminarStartedMessage,
} from "@/lib/seminars/registration-refusals";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  deleteIndividualSeminarInscriptionIntent,
  registerIndividualSeminarInscriptionIntent,
  type IndividualSeminarRow,
  type IndividualSeminarsActionData,
  type IndividualSeminarsLoaderData,
} from "./shared";

const seminarDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatSeminarMoment(seminar: {
  scheduledDate: string;
  startTime: string;
}) {
  return `${seminarDateFormatter.format(
    new Date(`${seminar.scheduledDate}T00:00:00Z`),
  )} · ${seminar.startTime}`;
}

function formatPrice(seminar: IndividualSeminarRow) {
  return seminar.priceAmount === null ? "—" : formatAmount(seminar.priceAmount);
}

/**
 * Why a seminar takes no new inscription, in the order the portal reads them:
 * a started seminar is closed whatever its price list says. A full seminar is
 * not one of them: registration is unlimited (docs/domain/seminars.md, "The
 * place").
 */
function getClosedReason(
  seminar: IndividualSeminarRow,
  hasRegistrationPrices: boolean,
) {
  if (seminar.hasStarted) {
    return seminarStartedMessage;
  }

  return hasRegistrationPrices ? null : seminarPricesMissingMessage;
}

/**
 * Why the name opens neither the registration nor the removal: the seminar
 * closed, or an academy already registered a row the individual's link
 * reaches, which only that academy can remove. Null when one of the two opens.
 */
function getBlockedCopy(
  seminar: IndividualSeminarRow,
  hasRegistrationPrices: boolean,
) {
  const closedReason = getClosedReason(seminar, hasRegistrationPrices);

  if (seminar.inscription || closedReason) {
    return {
      title: seminar.inscription
        ? "No se puede dar de baja la inscripción"
        : "No te podés inscribir a este seminario",
      reasonsTitle: "Inscripciones cerradas",
      reasons: closedReason ?? seminarStartedMessage,
      description: seminar.hasStarted
        ? "Una vez que el seminario comenzó ya no se puede inscribir ni dar de baja."
        : "Vas a poder inscribirte cuando se abran las inscripciones.",
    };
  }

  const [academyMade] = seminar.academyInscriptions;

  return academyMade
    ? {
        title: "No te podés inscribir a este seminario",
        reasonsTitle: "Ya estás inscripto",
        reasons: registeredByAcademyMessage(academyMade.academyName),
        description:
          "Para inscribirte por tu cuenta, tu academia tiene que dar de baja su inscripción.",
      }
    : null;
}

/**
 * `Seminarios`: the active event's seminars, what each costs the individual
 * and its own inscription in it. The instructor's name is the row's only
 * action, as on every list: it opens the registration, the removal, or why
 * neither can happen.
 */
export function IndividualSeminarsView({
  actionData,
  loaderData,
}: {
  actionData?: IndividualSeminarsActionData;
  loaderData: IndividualSeminarsLoaderData;
}) {
  const fetcher = useFetcher<IndividualSeminarsActionData>();
  const [opened, setOpened] = useState<{
    inscriptionId: string | null;
    seminarId: string;
  } | null>(null);
  // The dialog reads its seminar from the loader and stays open only while
  // the row holds the inscription it was opened on: once a registration or a
  // removal lands, the dialog it came from has nothing left to do and closes,
  // instead of turning into the opposite one.
  const openSeminar =
    loaderData.seminars.find(
      (seminar) =>
        seminar.id === opened?.seminarId &&
        (seminar.inscription?.id ?? null) === opened.inscriptionId,
    ) ?? null;
  const onOpen = (seminar: IndividualSeminarRow) =>
    setOpened({
      inscriptionId: seminar.inscription?.id ?? null,
      seminarId: seminar.id,
    });

  useServerActionToast(actionData);
  useServerActionToast(fetcher.data);

  return (
    <PortalListPage
      titleId="individual-seminars-title"
      title="Seminarios"
      description="Inscribite a los seminarios del evento activo y consultá el estado de tus inscripciones."
    >
      {!loaderData.hasActiveEvent ? (
        <PortalEmptyState
          title="No hay un evento activo"
          description="Los seminarios aparecen acá cuando se abre el próximo evento."
        />
      ) : loaderData.seminars.length === 0 ? (
        <PortalEmptyState
          title="Todavía no hay seminarios"
          description="El evento activo todavía no tiene seminarios. Volvé a consultar más adelante."
        />
      ) : (
        <ClientDataTable
          rows={loaderData.seminars}
          columns={buildColumns(onOpen)}
          getRowKey={(seminar) => seminar.id}
          renderCard={(seminar) => (
            <SeminarCard seminar={seminar} onOpen={onOpen} />
          )}
          searchPlaceholder="Buscar por instructor"
          matchesSearch={(seminar, search) =>
            seminar.instructorName
              .toLocaleLowerCase("es")
              .includes(search.toLocaleLowerCase("es"))
          }
          emptyMessage="No hay seminarios que coincidan con la búsqueda."
        />
      )}

      {openSeminar ? (
        <SeminarDialog
          fetcher={fetcher}
          hasRegistrationPrices={loaderData.hasRegistrationPrices}
          isSeenByAcademy={loaderData.isSeenByAcademy}
          onClose={() => setOpened(null)}
          seminar={openSeminar}
        />
      ) : null}
    </PortalListPage>
  );
}

function buildColumns(
  onOpen: (seminar: IndividualSeminarRow) => void,
): DataTableColumn<IndividualSeminarRow>[] {
  return [
    {
      id: "instructorName",
      header: "Seminario",
      className: "min-w-56 font-medium",
      cell: (seminar) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={() => onOpen(seminar)}
        >
          {seminar.instructorName}
        </Button>
      ),
      sortValue: (seminar) => seminar.instructorName,
    },
    {
      id: "moment",
      header: "Fecha y hora",
      cell: formatSeminarMoment,
      sortValue: (seminar) => `${seminar.scheduledDate} ${seminar.startTime}`,
    },
    {
      id: "price",
      header: "Precio",
      className: "tabular-nums",
      cell: formatPrice,
    },
    {
      id: "status",
      header: "Estado",
      cell: (seminar) => <InscriptionState seminar={seminar} />,
    },
  ];
}

/** The individual's own inscription by its money, or an academy's inscription
 * of a row its link reaches, which is the academy's to pay and read-only
 * here. */
function InscriptionState({ seminar }: { seminar: IndividualSeminarRow }) {
  if (seminar.inscription) {
    return <FinancialStatusBadge status={seminar.inscription.status} />;
  }

  if (seminar.academyInscriptions.length > 0) {
    return <span>Inscripto por {formatAcademyNames(seminar)}</span>;
  }

  return <span className="text-muted-foreground">Sin inscripción</span>;
}

function formatAcademyNames(seminar: IndividualSeminarRow) {
  return new Intl.ListFormat("es", { type: "conjunction" }).format(
    seminar.academyInscriptions.map((made) => made.academyName),
  );
}

/** A row on a phone: the seminar first, then what it costs and its state. */
function SeminarCard({
  onOpen,
  seminar,
}: {
  onOpen: (seminar: IndividualSeminarRow) => void;
  seminar: IndividualSeminarRow;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Button
          type="button"
          variant="link"
          className="h-auto min-w-0 p-0 text-left font-medium wrap-break-word"
          onClick={() => onOpen(seminar)}
        >
          {seminar.instructorName}
        </Button>
        <span className="shrink-0 text-sm tabular-nums">
          {formatPrice(seminar)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {formatSeminarMoment(seminar)}
        </span>
        <InscriptionState seminar={seminar} />
      </div>
    </>
  );
}

/**
 * What the name opens: the registration while the individual holds no
 * inscription, the removal while it holds one, and why neither can happen once
 * the seminar has closed.
 */
type ActionFetcher = ReturnType<
  typeof useFetcher<IndividualSeminarsActionData>
>;

function SeminarDialog({
  fetcher,
  hasRegistrationPrices,
  isSeenByAcademy,
  onClose,
  seminar,
}: {
  fetcher: ActionFetcher;
  hasRegistrationPrices: boolean;
  isSeenByAcademy: boolean;
  onClose: () => void;
  seminar: IndividualSeminarRow;
}) {
  const onOpenChange = (nextOpen: boolean) => (nextOpen ? null : onClose());

  // A held inscription opens its removal until the seminar starts.
  if (seminar.inscription && !seminar.hasStarted) {
    return (
      <RemovalDialog
        inscription={seminar.inscription}
        instructorName={seminar.instructorName}
        onOpenChange={onOpenChange}
      />
    );
  }

  const blocked = getBlockedCopy(seminar, hasRegistrationPrices);

  if (blocked) {
    return (
      <BlockedActionDialog open onOpenChange={onOpenChange} {...blocked} />
    );
  }

  return (
    <RegisterDialog
      fetcher={fetcher}
      isSeenByAcademy={isSeenByAcademy}
      onClose={onClose}
      seminar={seminar}
    />
  );
}

/**
 * The confirmation of a registration: the seminar, what it costs and the two
 * components of that price, how long the place is held and, through a
 * `Vinculado` link, that its academy will see it. The dialog stays open while the request is in flight, so a refusal is
 * read beside the seminar it was about; once the inscription appears on the
 * row, the page closes it.
 */
function RegisterDialog({
  fetcher,
  isSeenByAcademy,
  onClose,
  seminar,
}: {
  fetcher: ActionFetcher;
  isSeenByAcademy: boolean;
  onClose: () => void;
  seminar: IndividualSeminarRow;
}) {
  const isSubmitting = fetcher.state !== "idle";

  return (
    <Dialog open onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{seminar.instructorName}</DialogTitle>
          <DialogDescription>{formatSeminarMoment(seminar)}</DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-5">
          <input
            type="hidden"
            name="intent"
            value={registerIndividualSeminarInscriptionIntent}
          />
          <input type="hidden" name="seminarId" value={seminar.id} />
          {seminar.priceAmount === null ? null : (
            <PortalInscriptionPrice
              priceAmount={seminar.priceAmount}
              requiredDepositPercentage={seminar.requiredDepositPercentage}
            />
          )}
          <AlertStack>
            {seminar.isFull ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Cupo completo</AlertTitle>
                <AlertDescription>
                  Podés inscribirte igual, pero tu derecho de inscripción no se
                  cubre hasta que se libere un lugar.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertTitle>Reserva de lugar</AlertTitle>
                <AlertDescription>
                  {seminar.startsBeforePaymentDeadline
                    ? "Tenés hasta que empiece el seminario para enviar el pago del derecho de inscripción. Si no lo enviás en ese plazo, la inscripción pierde su lugar."
                    : "Tenés 48 horas para enviar el pago del derecho de inscripción. Si no lo enviás en ese plazo, la inscripción pierde su lugar."}
                </AlertDescription>
              </Alert>
            )}
            {isSeenByAcademy ? (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertTitle>Tu academia verá esta inscripción</AlertTitle>
                <AlertDescription>
                  Tu cuenta está vinculada, así que tu academia ve la
                  inscripción en sus seminarios, pero no lo que pagás.
                </AlertDescription>
              </Alert>
            ) : null}
          </AlertStack>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Inscribirme
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The individual's own removal, as an academy's: a row administration already
 * put money on is withdrawn and keeps it, any other is deleted.
 */
function RemovalDialog({
  inscription,
  instructorName,
  onOpenChange,
}: {
  inscription: NonNullable<IndividualSeminarRow["inscription"]>;
  instructorName: string;
  onOpenChange: (open: boolean) => void;
}) {
  if (inscription.hasMoney) {
    return (
      <WithdrawDialog
        confirmLabel="Retirar"
        consequence="La inscripción conserva su seña y lo que tenga por encima vuelve a tu saldo disponible. Si ya tenía la seña cubierta, su lugar se libera. El retiro es definitivo: si te volvés a inscribir, se crea una inscripción nueva, sin dinero."
        description={`Tu inscripción ya tiene dinero asignado, así que no se borra: queda retirada del seminario de ${instructorName}.`}
        intentValue={deleteIndividualSeminarInscriptionIntent}
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
      description={`Esta acción da de baja tu inscripción en el seminario de ${instructorName} y libera su lugar.`}
      intentValue={deleteIndividualSeminarInscriptionIntent}
      recordId={inscription.id}
      open
      onOpenChange={onOpenChange}
    />
  );
}
