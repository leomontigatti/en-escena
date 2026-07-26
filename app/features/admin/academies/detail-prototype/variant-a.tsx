// PROTOTIPO — descartable. Ver issue #488.
//
// Variante A — "Ficha operativa".
// Sigue el patrón del detalle de bailarín: card de datos arriba, pestañas
// abajo. Jerarquía: la academia es una ficha administrativa; coreografías y
// bailarines son anexos que se consultan de a uno.

import { Building2, Users } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/features/admin/finances/academy-detail/formatters";
import {
  formatChoreographyFinancialState,
  getChoreographyFinancialStateBadgeVariant,
} from "@/lib/finances/choreography-financial-state";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import type { AcademyDetailPrototypeLoaderData } from "./server";

type ChoreographyRow =
  AcademyDetailPrototypeLoaderData["choreographies"][number];
type DancerRow = AcademyDetailPrototypeLoaderData["dancers"][number];

export const variantAName = "Ficha operativa (pestañas)";

export function VariantA({
  loaderData,
}: {
  loaderData: AcademyDetailPrototypeLoaderData;
}) {
  const { academy, counts, summary } = loaderData;

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      selectedEventId={loaderData.selectedEventId}
      title={academy.name}
      description="Datos de contacto, coreografías inscriptas y plantel de bailarines."
    >
      <section className="flex flex-col gap-6">
        <AdminResourceFormCard title="Datos de la academia">
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <ReadOnlyField label="Nombre" value={academy.name} />
            <ReadOnlyField
              label="Email de acceso"
              value={academy.email ?? "—"}
            />
            <ReadOnlyField
              label="Nombre de contacto"
              value={academy.contactName}
            />
            <ReadOnlyField label="Teléfono" value={academy.phone} />
          </FieldGroup>
        </AdminResourceFormCard>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña adeudada"
            value={formatOperationalAmount(summary.owedDepositAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatOperationalAmount(summary.owedBalanceAmount)}
          />
          <MetricCard
            title="Resumen financiero"
            value={formatAmount(summary.totalPaidAmount)}
            to={`/administracion/finanzas/${academy.id}`}
            linkLabel="Ver detalle"
          />
        </section>

        <Tabs defaultValue="coreografias">
          <TabsList variant="line">
            <TabsTrigger value="coreografias">
              Coreografías ({counts.choreographies})
            </TabsTrigger>
            <TabsTrigger value="bailarines">
              Bailarines ({counts.dancers})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="coreografias" className="pt-4">
            {loaderData.choreographies.length > 0 ? (
              <ClientDataTable
                rows={loaderData.choreographies}
                columns={choreographyColumns(academy.id)}
                getRowKey={(row) => row.id}
                searchPlaceholder="Buscar coreografía por nombre"
                textFilterColumnId="name"
                emptyMessage="No hay coreografías que coincidan."
              />
            ) : (
              <AdminEmptyState
                icon={Building2}
                title="Sin coreografías en el evento activo"
                description="Cuando la academia inscriba coreografías, van a aparecer acá."
              />
            )}
          </TabsContent>

          <TabsContent value="bailarines" className="pt-4">
            {loaderData.dancers.length > 0 ? (
              <ClientDataTable
                rows={loaderData.dancers}
                columns={dancerColumns}
                getRowKey={(row) => row.id}
                searchPlaceholder="Buscar bailarín por nombre"
                textFilterColumnId="name"
                emptyMessage="No hay bailarines que coincidan."
              />
            ) : (
              <AdminEmptyState
                icon={Users}
                title="Sin bailarines cargados"
                description="La academia todavía no cargó su plantel."
              />
            )}
          </TabsContent>
        </Tabs>
      </section>
    </AdminResourceLayout>
  );
}

function choreographyColumns(
  academyId: string,
): DataTableColumn<ChoreographyRow>[] {
  return [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink
          to={`/administracion/finanzas/${academyId}/coreografias/${row.id}`}
        >
          {row.name}
        </DataTableLink>
      ),
      filterValue: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: "groupType",
      header: "Tipo",
      cell: (row) => (
        <Badge variant="secondary">{formatGroupTypeLabel(row.groupType)}</Badge>
      ),
    },
    {
      id: "registrationCount",
      header: "Bailarines",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => row.registrationCount,
    },
    {
      id: "financialState",
      header: "Estado",
      cell: (row) => (
        <Badge
          variant={getChoreographyFinancialStateBadgeVariant(
            row.financialState,
          )}
        >
          {formatChoreographyFinancialState(row.financialState)}
        </Badge>
      ),
    },
  ];
}

const dancerColumns: DataTableColumn<DancerRow>[] = [
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink to={`/administracion/bailarines/${row.id}`}>
        {row.fullName}
      </DataTableLink>
    ),
    filterValue: (row) => row.fullName,
    sortValue: (row) => row.lastName,
  },
  {
    id: "document",
    header: "Documento",
    className: "text-muted-foreground tabular-nums",
    cell: (row) => row.documentNumber ?? "—",
  },
  {
    id: "inscriptions",
    header: "Inscripciones",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => row.inscriptionCount,
  },
  {
    id: "identity",
    header: "Identidad",
    cell: (row) =>
      row.identityVerified ? (
        <Badge variant="success">Verificada</Badge>
      ) : (
        <Badge variant="secondary">Sin verificar</Badge>
      ),
  },
];
