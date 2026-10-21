import { Link } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton } from "@/components/shared/action-buttons";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatAmount } from "@/lib/finances/formatters";
import {
  comprobanteAnchorHref,
  formatComprobanteAnchorLabel,
} from "@/lib/comprobantes/anchor-reading";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
} from "@/lib/comprobantes/format";
import { formatComprobanteKindLabel } from "@/lib/comprobantes/kind";

import { ComprobanteStatusBadge } from "@/components/shared/comprobante-status-badge";
import type { ComprobanteDetail, ComprobanteDetailLoaderData } from "./server";

type ComprobanteDetailRouteViewProps = {
  loaderData: ComprobanteDetailLoaderData;
};

/**
 * Detail view of a comprobante (ADR-0011): it hosts the fiscal snapshot's data
 * and the actions menu (the invoiced unit, print). It is reached by its
 * number, on the global list and on the `Comprobantes` tab of its unit's
 * financial detail. It has no destructive action: a comprobante is never
 * annulled by hand, only credited by the credit note its unit's delta
 * owes (ADR-0014 §5).
 */
export function ComprobanteDetailRouteView({
  loaderData,
}: ComprobanteDetailRouteViewProps) {
  const comprobante = loaderData.comprobante;
  const printHref = `/administracion/comprobantes/${comprobante.id}/imprimir`;

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={`Comprobante ${formatComprobanteNumber(comprobante)}`}
      titleBadge={
        comprobante.status === null ? undefined : (
          <ComprobanteStatusBadge status={comprobante.status} />
        )
      }
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
        </ResourceActionsMenu>
      }
    >
      <ComprobanteDetailCard comprobante={comprobante} />
    </AdminResourceLayout>
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
          value={formatComprobanteKindLabel(comprobante.cbteTipo)}
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
