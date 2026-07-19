/**
 * PROTOTIPO #339 — variantes de la lista global de comprobantes.
 *
 * Vista nueva navegable desde el navbar (debajo de "Pagos"): el admin ve todas
 * las facturas y notas de crédito emitidas. Tres tomas estructurales distintas.
 * Datos stub. Throwaway.
 */

import { FileText } from "lucide-react";
import { Fragment } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { PrototypeSwitcher, useVariant } from "./switcher";
import {
  buildComprobanteList,
  EstadoBadge,
  formatAmount,
  formatComprobanteDate,
  formatComprobanteNumero,
  porcionLabel,
  TipoBadge,
  type StubComprobante,
} from "./stub";

const LIST_LABELS = {
  A: "Tabla plana (estilo Pagos)",
  B: "Agrupada por academia",
  C: "Factura con su NC anidada",
} as const;

type Row = ReturnType<typeof buildComprobanteList>[number];

export function ComprobantesListPrototype() {
  const variant = useVariant();
  const rows = buildComprobanteList();
  return (
    <AdminResourceLayout
      selectedEventId="proto"
      title="Comprobantes"
      description="Consultá todas las facturas y notas de crédito emitidas a ARCA."
    >
      {variant === "A" && <VariantA rows={rows} />}
      {variant === "B" && <VariantB rows={rows} />}
      {variant === "C" && <VariantC rows={rows} />}
      <PrototypeSwitcher labels={LIST_LABELS} />
    </AdminResourceLayout>
  );
}

// =============================================================================
// VARIANTE A — Tabla plana (mismo patrón que Pagos)
// =============================================================================

function VariantA({ rows }: { rows: Row[] }) {
  const columns: DataTableColumn<Row>[] = [
    {
      id: "numero",
      header: "Comprobante",
      className: "font-mono font-medium",
      cell: (r) => formatComprobanteNumero(r.ptoVta, r.cbteNro),
      filterValue: (r) => `${r.academyName} ${r.choreographyName} ${r.cbteNro}`,
    },
    {
      id: "tipo",
      header: "Tipo",
      cell: (r) => <TipoBadge tipo={r.tipoComprobante} />,
    },
    {
      id: "academia",
      header: "Academia",
      className: "text-muted-foreground",
      cell: (r) => r.academyName,
    },
    {
      id: "coreografia",
      header: "Coreografía",
      className: "text-muted-foreground",
      cell: (r) => r.choreographyName,
    },
    { id: "porcion", header: "Porción", cell: (r) => porcionLabel(r.porcion) },
    {
      id: "fecha",
      header: "Fecha",
      cell: (r) => formatComprobanteDate(r.fechaEmision),
      sortValue: (r) => r.fechaEmision,
    },
    {
      id: "importe",
      header: "Importe",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (r) => formatAmount(r.impTotalSnapshot),
    },
    {
      id: "estado",
      header: "Estado",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <EstadoBadge estado={r.estado} />
          {r.desactualizada ? (
            <Badge variant="warning">Desactualizada</Badge>
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <ClientDataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      searchPlaceholder="Buscar por academia, coreografía o número"
      emptyMessage="No hay comprobantes emitidos."
    />
  );
}

// =============================================================================
// VARIANTE B — Agrupada por academia
// =============================================================================

function VariantB({ rows }: { rows: Row[] }) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    groups.set(r.academyName, [...(groups.get(r.academyName) ?? []), r]);
  }
  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([academy, items]) => {
        const totalVigente = items
          .filter(
            (i) => i.estado === "vigente" && i.tipoComprobante === "factura",
          )
          .reduce((s, i) => s + i.impTotalSnapshot, 0);
        return (
          <Card key={academy}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{academy}</CardTitle>
              <span className="text-sm text-muted-foreground">
                {items.length} comprobante{items.length === 1 ? "" : "s"} ·
                vigente{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatAmount(totalVigente)}
                </span>
              </span>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono">
                      {formatComprobanteNumero(r.ptoVta, r.cbteNro)}
                    </span>
                    <TipoBadge tipo={r.tipoComprobante} />
                    <span className="text-muted-foreground">
                      {r.choreographyName}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">
                      {formatAmount(r.impTotalSnapshot)}
                    </span>
                    <EstadoBadge estado={r.estado} />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// =============================================================================
// VARIANTE C — Factura con su NC anidada (cadena espejo)
// =============================================================================

function VariantC({ rows }: { rows: Row[] }) {
  const facturas = rows.filter((r) => r.tipoComprobante === "factura");
  const ncByRelacion = new Map<string, StubComprobante>();
  for (const r of rows) {
    if (r.tipoComprobante === "nota-credito" && r.relacionadoId) {
      ncByRelacion.set(r.relacionadoId, r);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Comprobantes emitidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comprobante</TableHead>
              <TableHead>Academia / Coreografía</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facturas.map((f) => {
              const nc = ncByRelacion.get(f.id);
              return (
                <Fragment key={f.id}>
                  <TableRow>
                    <TableCell className="font-mono font-medium">
                      {formatComprobanteNumero(f.ptoVta, f.cbteNro)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{f.academyName}</span>
                        <span className="text-xs text-muted-foreground">
                          {f.choreographyName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatComprobanteDate(f.fechaEmision)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(f.impTotalSnapshot)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <EstadoBadge estado={f.estado} />
                        {f.desactualizada ? (
                          <Badge variant="warning">Desactualizada</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                  {nc ? (
                    <TableRow className="bg-muted/30">
                      <TableCell className="pl-8 font-mono text-muted-foreground">
                        ↳ {formatComprobanteNumero(nc.ptoVta, nc.cbteNro)}
                      </TableCell>
                      <TableCell colSpan={2}>
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <TipoBadge tipo="nota-credito" /> anula la factura
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        −{formatAmount(nc.impTotalSnapshot)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
