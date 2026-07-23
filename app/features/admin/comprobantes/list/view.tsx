import { AlertTriangle, Ban, LoaderCircle, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAmount } from "@/features/admin/academies/account-current/formatters";
import { ContingencyAlert } from "@/features/admin/comprobantes/contingency-alert";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteStatusLabel,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type {
  AdminComprobanteRow,
  AdminComprobantesListLoaderData,
} from "./server";
import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  type AdminComprobantesListActionData,
} from "./shared";

type AdministracionComprobantesRouteViewProps = {
  loaderData: AdminComprobantesListLoaderData;
};

export const comprobanteColumns: DataTableColumn<AdminComprobanteRow>[] = [
  {
    id: "numero",
    header: "Comprobante",
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink
        to={`/administracion/finanzas/${row.academyId}/coreografias/${row.choreographyId}`}
      >
        {formatComprobanteNumber(row)}
      </DataTableLink>
    ),
    filterValue: (row) => formatComprobanteNumber(row),
    sortValue: (row) => `${row.ptoVta}-${String(row.cbteNro).padStart(8, "0")}`,
  },
  {
    id: "tipo",
    header: "Tipo",
    cell: (row) => (
      <Badge
        variant={row.cbteTipo === FACTURA_C_CBTE_TIPO ? "outline" : "info"}
      >
        {formatComprobanteTipoLabel(row.cbteTipo)}
      </Badge>
    ),
    filterValue: (row) => formatComprobanteTipoLabel(row.cbteTipo),
  },
  {
    id: "coreografia",
    header: "Coreografía",
    className: "text-muted-foreground",
    cell: (row) => row.choreographyName,
    filterValue: (row) => row.choreographyName,
    sortValue: (row) => row.choreographyName,
  },
  {
    id: "academia",
    header: "Academia",
    className: "text-muted-foreground",
    cell: (row) => row.academyName,
    filterValue: (row) => row.academyName,
    sortValue: (row) => row.academyName,
  },
  {
    id: "cae",
    header: "CAE",
    className: "text-muted-foreground tabular-nums",
    cell: (row) => row.cae,
    filterValue: (row) => row.cae,
  },
  {
    id: "fecha",
    header: "Fecha",
    className: "tabular-nums",
    cell: (row) => formatComprobanteArcaDate(row.cbteFch),
    sortValue: (row) => row.cbteFch,
  },
  {
    id: "importe",
    header: "Importe",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.impTotal),
    sortValue: (row) => row.impTotal,
  },
  {
    id: "estado",
    header: "Estado",
    cell: (row) => (
      <Badge variant={row.status === "vigente" ? "success" : "destructive"}>
        {formatComprobanteStatusLabel(row.status)}
      </Badge>
    ),
    filterValue: (row) => row.status,
  },
  {
    id: "imprimir",
    header: "",
    className: "text-right",
    headerClassName: "text-right",
    // Enlaza al impreso on-demand del comprobante (#329/#334). Abre en una
    // pestaña nueva porque el loader devuelve un documento HTML suelto, sin
    // chrome de administración, listo para imprimir.
    cell: (row) => (
      <a
        href={`/administracion/comprobantes/${row.id}/imprimir`}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline-offset-4 hover:underline"
      >
        Imprimir
      </a>
    ),
  },
  {
    id: "anular",
    header: "",
    className: "text-right",
    headerClassName: "text-right",
    // Anulación por Nota de crédito (#339). Es la única mutación de la pantalla
    // y vive por fila porque cada anulación tiene su propio diálogo y su propia
    // contingencia de ARCA.
    cell: (row) => <AnnulComprobanteCell row={row} />,
  },
];

/**
 * Afordancia de anulación de una fila. Sólo aparece sobre una Factura C vigente:
 * la Nota de crédito es ella misma la anulación y una factura ya anulada no se
 * vuelve a anular. La anulación pasa siempre por un diálogo con confirmación
 * irreversible, igual que la emisión.
 */
function AnnulComprobanteCell({ row }: { row: AdminComprobanteRow }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<AdminComprobantesListActionData>();
  const [confirmed, setConfirmed] = useState(false);
  const isSaving = fetcher.state !== "idle";
  const contingency =
    fetcher.data?.status === "annul-error" ? fetcher.data : null;
  const genericError =
    fetcher.data?.status === "error" ? fetcher.data.message : null;

  useServerActionToast(
    fetcher.data?.status === "success" ? fetcher.data : undefined,
    { toastId: notificationToasts["comprobante-anulado"].id },
  );

  // El camino feliz no redirige (matriz de feedback: mutación inline sobre una
  // lista). La lista revalida sola y la fila pasa a `Anulada`; acá sólo hay que
  // cerrar el diálogo.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.status === "success") {
      setOpen(false);
      setConfirmed(false);
    }
  }, [fetcher.data, fetcher.state]);

  if (!row.canAnnul) {
    return null;
  }

  function handleOpenChange(next: boolean) {
    if (isSaving) {
      return;
    }
    if (!next) {
      setConfirmed(false);
    }
    setOpen(next);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Ban aria-hidden="true" data-icon="inline-start" />
        Anular
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent overlayClassName="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Anular comprobante</DialogTitle>
            <DialogDescription>
              Se emite una nota de crédito por el total del comprobante. La
              anulación es irreversible.
            </DialogDescription>
          </DialogHeader>

          <fetcher.Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value={annulComprobanteIntent} />
            <input type="hidden" name="comprobanteId" value={row.id} />

            <div className="flex flex-col gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <AnnulPreviewRow
                label="Comprobante"
                value={`${formatComprobanteTipoLabel(row.cbteTipo)} ${formatComprobanteNumber(row)}`}
              />
              <AnnulPreviewRow
                label="Coreografía"
                value={row.choreographyName}
              />
              <AnnulPreviewRow label="Academia" value={row.academyName} />
              <AnnulPreviewRow
                label="Importe a anular"
                strong
                value={formatAmount(row.impTotal)}
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                name="confirm"
                value={annulComprobanteConfirmValue}
                aria-label="Confirmo que la anulación es irreversible"
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
                disabled={isSaving}
              />
              <span>
                Confirmo que la anulación del comprobante es irreversible y no
                puede deshacerse.
              </span>
            </label>

            {contingency ? (
              <ContingencyAlert
                message={contingency.message}
                contingency={contingency.contingency}
              />
            ) : null}

            {genericError ? (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertDescription>{genericError}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={!confirmed || isSaving}
              >
                {isSaving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <Ban aria-hidden="true" data-icon="inline-start" />
                )}
                Confirmar anulación
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnnulPreviewRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          strong ? "text-sm font-medium tabular-nums" : "text-sm tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

const comprobanteEstadoFacetOptions = [
  { label: "Vigente", value: "vigente" },
  { label: "Anulada", value: "anulada" },
];

const comprobanteTipoFacetOptions = [
  {
    label: formatComprobanteTipoLabel(FACTURA_C_CBTE_TIPO),
    value: formatComprobanteTipoLabel(FACTURA_C_CBTE_TIPO),
  },
  {
    label: formatComprobanteTipoLabel(NOTA_CREDITO_C_CBTE_TIPO),
    value: formatComprobanteTipoLabel(NOTA_CREDITO_C_CBTE_TIPO),
  },
];

export function buildComprobanteFacetedFilters(
  loaderData: AdminComprobantesListLoaderData,
): DataTableFacetedFilter[] {
  return [
    {
      id: "estado",
      label: "Estado",
      options: comprobanteEstadoFacetOptions,
    },
    {
      id: "tipo",
      label: "Tipo",
      options: comprobanteTipoFacetOptions,
    },
    {
      id: "academia",
      label: "Academia",
      options: loaderData.academyFacetOptions,
    },
  ];
}

export function AdministracionComprobantesRouteView({
  loaderData,
}: AdministracionComprobantesRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Comprobantes"
      description="Revisá los comprobantes electrónicos emitidos para el evento activo y su estado fiscal."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar comprobantes",
        description:
          "Activá un evento para consultar los comprobantes emitidos por administración.",
      }}
    >
      {loaderData.rows.length > 0 ? (
        <ClientDataTable
          rows={loaderData.rows}
          columns={comprobanteColumns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar por número, coreografía, academia o CAE"
          facetedFilters={buildComprobanteFacetedFilters(loaderData)}
          initialSort={{ columnId: "fecha", direction: "desc" }}
          emptyMessage="No hay comprobantes que coincidan con la búsqueda o los filtros."
        />
      ) : (
        <AdminEmptyState
          icon={ReceiptText}
          title="Todavía no hay comprobantes emitidos."
          description="Cuando administración emita comprobantes para el evento activo, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}
