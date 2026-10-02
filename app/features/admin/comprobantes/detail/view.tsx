import { Ban, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton } from "@/components/shared/action-buttons";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatAmount } from "@/lib/finances/formatters";
import {
  comprobanteAnchorHref,
  formatComprobanteAnchorLabel,
} from "@/lib/comprobantes/anchor-reading";
import {
  ContingencyAlert,
  contingencyCancelLabel,
  resolveContingencySubmitState,
} from "@/lib/comprobantes/contingency-alert";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteStatusLabel,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";
import { lowercaseFirst } from "@/lib/shared/utils";

import type { ComprobanteDetail, ComprobanteDetailLoaderData } from "./server";
import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  recheckNotaCreditoIntent,
  type ComprobanteDetailActionData,
} from "./shared";

type ComprobanteDetailRouteViewProps = {
  // Lets the tests mount the annulment dialog already open without depending on
  // opening the actions menu (which lives in a portal), just like the payment
  // detail with its delete dialog.
  initialAnnulDialogOpen?: boolean;
  loaderData: ComprobanteDetailLoaderData;
};

/**
 * Detail view of a comprobante (ADR-0011): it hosts the fiscal snapshot's data
 * and the actions menu (the invoiced unit, print, annul). The number on the global list is now its
 * ONLY entry point — the choreography financial detail's amount cards used to
 * link here through the `porción` badges, and both went with the field, which is
 * the navigation cost #723 took knowingly. Annulment lives here, next to the
 * comprobante it affects, and is confirmed with an `AlertDialog` whose copy
 * tells the truth: the real way out is a credit note.
 */
export function ComprobanteDetailRouteView({
  initialAnnulDialogOpen = false,
  loaderData,
}: ComprobanteDetailRouteViewProps) {
  const comprobante = loaderData.comprobante;
  // The dialog only opens over an annullable comprobante — the menu item is the
  // only affordance — but once open it survives it ceasing to be one.
  const [isAnnulDialogOpen, setIsAnnulDialogOpen] = useState(
    initialAnnulDialogOpen && comprobante.canAnnul,
  );

  const printHref = `/administracion/comprobantes/${comprobante.id}/imprimir`;

  return (
    <>
      <AdminResourceLayout
        requireSelectedEvent={false}
        title={`Comprobante ${formatComprobanteNumber(comprobante)}`}
        description="Consultá los datos del comprobante y ejecutá sus acciones."
        headerAction={
          <ResourceActionsMenu>
            <DropdownMenuItem asChild>
              <Link
                to={comprobanteAnchorHref({
                  academyId: comprobante.academyId,
                  reading: comprobante.anchor,
                })}
              >
                {comprobante.anchor.kind === "choreography"
                  ? "Ver la coreografía"
                  : "Ver el seminario"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={printHref} target="_blank" rel="noreferrer">
                Imprimir
              </a>
            </DropdownMenuItem>
            {comprobante.canAnnul ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    setIsAnnulDialogOpen(true);
                  }}
                >
                  Anular
                </DropdownMenuItem>
              </>
            ) : null}
          </ResourceActionsMenu>
        }
      >
        <ComprobanteDetailCard comprobante={comprobante} />
      </AdminResourceLayout>

      {/* It unmounts when it is CLOSED, not when it loses the affordance: an
          annulment recovered via "Verificar ahora" persists the credit note
          and revalidates the detail, which stops being annullable. Unmounting
          there would take the `recovered` state the dialog exists to show with
          it (#577). */}
      {comprobante.canAnnul || isAnnulDialogOpen ? (
        <AnnulDialog
          comprobante={comprobante}
          open={isAnnulDialogOpen}
          onOpenChange={setIsAnnulDialogOpen}
        />
      ) : null}
    </>
  );
}

function ComprobanteDetailCard({
  comprobante,
}: {
  comprobante: ComprobanteDetail;
}) {
  return (
    <AdminResourceFormCard
      footer={
        <PinnedActions>
          <BackButton to="/administracion/comprobantes" />
        </PinnedActions>
      }
    >
      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <ReadOnlyField
          label="Tipo"
          value={formatComprobanteTipoLabel(comprobante.cbteTipo)}
        />
        <ReadOnlyField
          label="Estado"
          value={formatComprobanteStatusLabel(comprobante.status)}
        />
        <ReadOnlyField label="Academia" value={comprobante.academyName} />
        <ReadOnlyField
          label={anchorKindLabel(comprobante.anchor)}
          value={formatComprobanteAnchorLabel(comprobante.anchor)}
        />
        <ReadOnlyField label="Evento" value={comprobante.eventName} />
        <ReadOnlyField
          label="Fecha"
          value={formatComprobanteArcaDate(comprobante.cbteFch)}
        />
        <ReadOnlyField label="CAE" value={comprobante.cae} />
        {comprobante.fchServDesde && comprobante.fchServHasta ? (
          <ReadOnlyField
            label="Período de servicio"
            value={`${formatComprobanteArcaDate(
              comprobante.fchServDesde,
            )} — ${formatComprobanteArcaDate(comprobante.fchServHasta)}`}
          />
        ) : null}
        {comprobante.fchVtoPago ? (
          <ReadOnlyField
            label="Vencimiento de pago"
            value={formatComprobanteArcaDate(comprobante.fchVtoPago)}
          />
        ) : null}
        <ReadOnlyField
          label="Importe"
          value={formatAmount(comprobante.impTotal)}
        />
      </FieldGroup>
    </AdminResourceFormCard>
  );
}

function anchorKindLabel(anchor: ComprobanteDetail["anchor"]) {
  return anchor.kind === "choreography" ? "Coreografía" : "Seminario";
}

/**
 * Annulment confirmation as an `AlertDialog` (ADR-0011): focus trapped, it does
 * not close on an outside click and it exposes `role="alertdialog"`. No
 * checkbox: the confirmation is the dialog itself. The copy says what is being
 * annulled, for how much, and that the annulment materializes by emitting a
 * mirror credit note.
 */
function AnnulDialog({
  comprobante,
  open,
  onOpenChange,
}: {
  comprobante: ComprobanteDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The action's feedback travels via `fetcher.data`, not via `useActionData`:
  // the form is submitted with the fetcher, so the response (ARCA's
  // rejection/contingency) comes back here and not to the route's `actionData`.
  // The happy path redirects and the fetcher follows it, revalidating the detail
  // (which stops being annullable).
  const fetcher = useFetcher<ComprobanteDetailActionData>();
  const isSaving = fetcher.state !== "idle";
  const actionData = fetcher.data;
  const contingency =
    actionData?.status === "contingency" ? actionData.contingency : null;
  const genericError =
    actionData?.status === "error" ? actionData.message : null;

  // Manual verification is declared by the operator, so it cannot survive a new
  // attempt: every response from the server clears it and the retry goes back to
  // being blocked if it is still unresolved.
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    setAcknowledged(false);
  }, [fetcher.data]);

  const submitState = resolveContingencySubmitState(contingency, acknowledged);

  function handleOpenChange(next: boolean) {
    if (isSaving) {
      return;
    }
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Anular comprobante</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a anular la{" "}
            {lowercaseFirst(formatComprobanteTipoLabel(comprobante.cbteTipo))}{" "}
            {formatComprobanteNumber(comprobante)} por{" "}
            {formatAmount(comprobante.impTotal)}. La anulación se materializa
            emitiendo una nota de crédito espejo.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value={annulComprobanteIntent} />
          <input
            type="hidden"
            name="confirm"
            value={annulComprobanteConfirmValue}
          />

          {contingency ? (
            <ContingencyAlert
              acknowledged={acknowledged}
              contingency={contingency}
              isBusy={isSaving}
              onAcknowledge={() => setAcknowledged(true)}
              onRecheck={(payload) =>
                fetcher.submit(payload, { method: "post" })
              }
              recheckIntent={recheckNotaCreditoIntent}
            />
          ) : null}

          {genericError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>No se pudo anular el comprobante</AlertTitle>
              <AlertDescription>{genericError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isSaving}>
              {contingencyCancelLabel(submitState)}
            </AlertDialogCancel>
            {/* Recovered: the credit note is already authorized and on
                record, so the button is removed. Disabling it would read as
                "hold on" and would invite a retry that would emit a second one. */}
            {submitState === "removed" ? null : (
              <Button
                type="submit"
                variant="destructive"
                disabled={isSaving || submitState === "blocked"}
              >
                {isSaving ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Ban aria-hidden="true" data-icon="inline-start" />
                )}
                Anular comprobante
              </Button>
            )}
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
