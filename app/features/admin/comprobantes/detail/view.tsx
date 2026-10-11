import { Ban } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton } from "@/components/shared/action-buttons";
import { ArcaConfirmationDialog } from "@/components/shared/arca-confirmation-dialog";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatAmount } from "@/lib/finances/formatters";
import {
  comprobanteAnchorHref,
  formatComprobanteAnchorLabel,
} from "@/lib/comprobantes/anchor-reading";
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
                  onSelect={() => setIsAnnulDialogOpen(true)}
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
 * Annulment confirmation (ADR-0011). The copy says what is being annulled,
 * for how much, and that the annulment materializes by emitting a mirror
 * credit note.
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
  return (
    <ArcaConfirmationDialog
      confirmIcon={Ban}
      confirmLabel="Anular"
      confirmValue={annulComprobanteConfirmValue}
      description={
        <>
          Vas a anular la{" "}
          {lowercaseFirst(formatComprobanteTipoLabel(comprobante.cbteTipo))}{" "}
          {formatComprobanteNumber(comprobante)} por{" "}
          {formatAmount(comprobante.impTotal)}. La anulación se materializa
          emitiendo una nota de crédito espejo.
        </>
      }
      destructive
      intent={annulComprobanteIntent}
      onOpenChange={onOpenChange}
      open={open}
      recheckIntent={recheckNotaCreditoIntent}
      title="¿Anular el comprobante?"
      toastId="comprobante-annul:error"
    />
  );
}
