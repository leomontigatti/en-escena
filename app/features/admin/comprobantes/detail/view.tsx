import { AlertTriangle, Ban, Check, LoaderCircle, Printer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useFetcher } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatAmount } from "@/features/admin/academies/account-current/formatters";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobantePorcionLabel,
  formatComprobanteStatusLabel,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";

import type { ComprobanteDetail, ComprobanteDetailLoaderData } from "./server";
import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  type ComprobanteDetailActionData,
} from "./shared";

type AdministracionComprobanteDetalleRouteViewProps = {
  actionData?: ComprobanteDetailActionData;
  // Permite a los tests montar el diálogo de anulación abierto sin depender de
  // abrir el menú de acciones (que vive en un portal), igual que el detalle de
  // pago con su diálogo de borrado.
  initialAnnulDialogOpen?: boolean;
  loaderData: ComprobanteDetailLoaderData;
};

/**
 * Vista de detalle de un comprobante (ADR-0011): aloja los datos del snapshot
 * fiscal y el menú de acciones (imprimir, anular). Es el destino del número de la
 * lista global y de los botones de porción del detalle financiero. La anulación
 * vive acá, junto al comprobante que afecta, y se confirma con un `AlertDialog`
 * cuyo copy dice la verdad: la salida real es una Nota de crédito.
 */
export function AdministracionComprobanteDetalleRouteView({
  actionData,
  initialAnnulDialogOpen = false,
  loaderData,
}: AdministracionComprobanteDetalleRouteViewProps) {
  const comprobante = loaderData.comprobante;
  const [isAnnulDialogOpen, setIsAnnulDialogOpen] = useState(
    initialAnnulDialogOpen,
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
              <a href={printHref} target="_blank" rel="noreferrer">
                <Printer aria-hidden="true" />
                Imprimir
              </a>
            </DropdownMenuItem>
            {comprobante.canAnnul ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setIsAnnulDialogOpen(true);
                }}
              >
                <Ban aria-hidden="true" />
                Anular
              </DropdownMenuItem>
            ) : null}
          </ResourceActionsMenu>
        }
      >
        <ComprobanteDetailCard comprobante={comprobante} />
      </AdminResourceLayout>

      {comprobante.canAnnul ? (
        <AnnulDialog
          actionData={actionData}
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
      contentClassName="gap-4"
      footer={
        <Button asChild variant="outline">
          <Link to="/administracion/comprobantes">Volver</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <DetailRow
          label="Tipo"
          value={
            <Badge variant="outline">
              {formatComprobanteTipoLabel(comprobante.cbteTipo)}
            </Badge>
          }
        />
        <DetailRow
          label="Estado"
          value={
            <Badge
              variant={
                comprobante.status === "vigente" ? "success" : "destructive"
              }
            >
              {formatComprobanteStatusLabel(comprobante.status)}
            </Badge>
          }
        />
        <DetailRow
          label="Porción"
          value={formatComprobantePorcionLabel(comprobante.porcion)}
        />
        <DetailRow label="Academia" value={comprobante.academyName} />
        <DetailRow
          label="Coreografía"
          value={
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={`/administracion/finanzas/${comprobante.academyId}/coreografias/${comprobante.choreographyId}`}
            >
              {comprobante.choreographyName}
            </Link>
          }
        />
        <DetailRow label="Evento" value={comprobante.eventName} />
        <DetailRow
          label="Fecha"
          value={formatComprobanteArcaDate(comprobante.cbteFch)}
        />
        <DetailRow label="CAE" value={comprobante.cae} />
        {comprobante.fchServDesde && comprobante.fchServHasta ? (
          <DetailRow
            label="Período de servicio"
            value={`${formatComprobanteArcaDate(
              comprobante.fchServDesde,
            )} — ${formatComprobanteArcaDate(comprobante.fchServHasta)}`}
          />
        ) : null}
        {comprobante.fchVtoPago ? (
          <DetailRow
            label="Vencimiento de pago"
            value={formatComprobanteArcaDate(comprobante.fchVtoPago)}
          />
        ) : null}
        <DetailRow
          label="Importe"
          strong
          value={formatAmount(comprobante.impTotal)}
        />
      </div>
    </AdminResourceFormCard>
  );
}

function DetailRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "text-sm font-medium tabular-nums"
            : "text-right text-sm tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Confirmación de anulación como `AlertDialog` (ADR-0011): foco atrapado, no se
 * cierra al clickear afuera y expone `role="alertdialog"`. Sin checkbox: la
 * confirmación es el diálogo mismo. El copy dice qué se anula, por cuánto, y que
 * la anulación se materializa emitiendo una Nota de crédito espejo.
 */
function AnnulDialog({
  actionData,
  comprobante,
  open,
  onOpenChange,
}: {
  actionData?: ComprobanteDetailActionData;
  comprobante: ComprobanteDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher();
  const isSaving = fetcher.state !== "idle";
  const contingency = actionData?.status === "annul-error" ? actionData : null;
  const genericError =
    actionData?.status === "error" ? actionData.message : null;

  function handleOpenChange(next: boolean) {
    if (isSaving) {
      return;
    }
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular comprobante</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a anular la {formatComprobanteTipoLabel(comprobante.cbteTipo)}{" "}
            {formatComprobanteNumber(comprobante)} por{" "}
            {formatAmount(comprobante.impTotal)} (
            {formatComprobantePorcionLabel(comprobante.porcion)}). La anulación
            se materializa emitiendo una Nota de crédito espejo.
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
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>
                <div className="flex flex-col gap-1">
                  <span>{contingency.message}</span>
                  {contingency.contingency.errors.map((error) => (
                    <span key={error}>{error}</span>
                  ))}
                  {contingency.contingency.observaciones.map((observacion) => (
                    <span key={observacion}>{observacion}</span>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {genericError ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{genericError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isSaving}>
              Cancelar
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Anular comprobante
            </Button>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
