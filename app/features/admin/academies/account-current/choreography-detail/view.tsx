import { ArrowLeft, CircleDollarSign, Landmark, Receipt } from "lucide-react";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../formatters";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>
>;

type AdministracionCoreografiaFinancieraDetalleViewProps = {
  loaderData: ChoreographyFinanceDetailLoaderData;
};

export function AdministracionCoreografiaFinancieraDetalleView({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleViewProps) {
  const choreography = loaderData.choreography;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={
        choreography
          ? "Detalle financiero de coreografía"
          : "Coreografía no encontrada"
      }
      description={
        choreography
          ? "Revisá los importes, datos y participaciones vinculadas a esta coreografía."
          : "No encontramos esa coreografía dentro de la cuenta corriente de la academia."
      }
      headerAction={
        <Button asChild variant="outline">
          <Link to={`/administracion/finanzas/${loaderData.academy.id}`}>
            <ArrowLeft aria-hidden="true" data-icon />
            Volver a cuenta corriente
          </Link>
        </Button>
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar la coreografía",
        description:
          "Activá un evento para consultar el detalle financiero de una coreografía.",
      }}
    >
      {choreography ? (
        <div className="flex flex-col gap-6">
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={Receipt}
              title="Seña"
              value={formatOperationalAmount(choreography.depositAmount)}
            />
            <MetricCard
              icon={CircleDollarSign}
              title="Pagado"
              value={formatAmount(choreography.paidAmount)}
            />
            <MetricCard
              icon={Landmark}
              title="Saldo"
              value={formatOperationalAmount(choreography.owedAmount)}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Datos de coreografía</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  id="finance-choreography-academy"
                  label="Academia"
                  value={loaderData.academy.name}
                />
                <ReadOnlyField
                  id="finance-choreography-name"
                  label="Nombre"
                  value={choreography.name}
                />
                <ReadOnlySelectField
                  label="Tipo de grupo"
                  options={choreographyGroupTypeOptions}
                  value={choreography.groupType}
                />
                <ReadOnlyDateField
                  emptyLabel="Sin pago completo"
                  label="Fecha de pago de la seña"
                  value={choreography.depositCompletedOn}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <ParticipationsTable participations={loaderData.participations} />
        </div>
      ) : (
        <AdminEmptyState
          title="Coreografía no encontrada"
          description="Volvé a la cuenta corriente y elegí una coreografía de la lista."
        />
      )}
    </AdminResourceLayout>
  );
}

function ParticipationsTable({
  participations,
}: {
  participations: ChoreographyFinanceDetailLoaderData["participations"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Participaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bailarín</TableHead>
              <TableHead className="text-right">Precio base</TableHead>
              <TableHead className="text-right">Descuento</TableHead>
              <TableHead className="text-right">Precio final</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participations.length > 0 ? (
              participations.map((participation) => (
                <TableRow key={participation.dancerId}>
                  <TableCell className="font-medium">
                    {formatDancerName(participation)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatParticipationAmount(participation.basePriceAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(participation.discountAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatParticipationAmount(participation.finalPriceAmount)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay participaciones para mostrar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatDancerName(input: { firstName: string; lastName: string }) {
  return `${input.firstName} ${input.lastName}`;
}

function formatParticipationAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}
