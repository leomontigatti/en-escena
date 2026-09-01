import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

import { MetricCard } from "@/components/shared/metric-card";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/features/admin/finances/formatters";
import type { loadPortalChoreographyFinanceDetail } from "@/features/portal/finances/choreography-detail/server";
import {
  formatInscriptionFinancialStatus,
  formatInscriptionStatusBadge,
} from "@/lib/finances/choreography-financial-status";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

type PortalChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadPortalChoreographyFinanceDetail>
>;

type InscriptionRow =
  PortalChoreographyFinanceDetailLoaderData["inscriptions"][number];

export function PortalChoreographyFinanceDetailRouteView({
  loaderData,
}: {
  loaderData: PortalChoreographyFinanceDetailLoaderData;
}) {
  const choreography = loaderData.choreography;

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="finanzas-coreografia-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="finanzas-coreografia-title" className="text-xl font-semibold">
          Detalle financiero
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Revisá los importes de esta coreografía y de cada bailarín inscripto.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Total"
          value={formatOperationalAmount(choreography.totalAmount)}
        />
        <MetricCard
          title="Pagado"
          value={formatAmount(choreography.allocatedAmount)}
        />
        <MetricCard
          title="Saldo adeudado"
          value={formatOperationalAmount(choreography.owedBalanceAmount)}
        />
      </section>

      <Card aria-label="Información financiera">
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField
              id="portal-finance-choreography-name"
              label="Nombre"
              value={choreography.name}
            />
            <ReadOnlySelectField
              label="Tipo de grupo"
              options={choreographyGroupTypeOptions}
              value={choreography.groupType}
            />
            <ReadOnlyField
              id="portal-finance-choreography-status"
              label="Estado"
              value={formatInscriptionFinancialStatus(
                choreography.financialStatus,
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <InscriptionsTable inscriptions={loaderData.inscriptions} />
    </section>
  );
}

/**
 * Column styling, decorative and unconditional. No figure is provisional, so
 * there is nothing left to mute per row: the whole of `Total` is muted because it
 * is the context column — what the debt is measured against, which the academy
 * reads in its own metric above — and a grey that varied per row would go back to
 * meaning something.
 */
const amountColumnClassName = "text-right tabular-nums";
const totalColumnClassName = "text-right tabular-nums text-muted-foreground";

function InscriptionsTable({
  inscriptions,
}: {
  inscriptions: InscriptionRow[];
}) {
  return (
    <Card aria-label="Inscripciones">
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bailarín</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Precio base</TableHead>
              <TableHead className="text-right">Seña</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inscriptions.length > 0 ? (
              inscriptions.map((inscription) => (
                <TableRow key={inscription.dancerId}>
                  <TableCell className="font-medium">
                    {inscription.firstName} {inscription.lastName}
                  </TableCell>
                  <TableCell>
                    <InscriptionStatusBadge inscription={inscription} />
                  </TableCell>
                  <TableCell className={amountColumnClassName}>
                    {formatInscriptionAmount(inscription.basePriceAmount)}
                  </TableCell>
                  <TableCell className={amountColumnClassName}>
                    {formatInscriptionAmount(inscription.depositAmount)}
                  </TableCell>
                  <TableCell className={totalColumnClassName}>
                    {formatInscriptionAmount(inscription.totalAmount)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay inscripciones para mostrar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="justify-between gap-3 border-0 bg-transparent pt-0">
        <Button asChild variant="outline">
          <Link to="/portal/finanzas">
            <ChevronLeft aria-hidden="true" data-icon="inline-start" />
            Volver
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * The academy reads the same badge as the admin, through the same resolver: a
 * withdrawn inscription reads `Retirada` with what was retained on it, not the
 * status of a roster it is no longer part of. The money is theirs and they have
 * to be able to see it.
 */
function InscriptionStatusBadge({
  inscription,
}: {
  inscription: InscriptionRow;
}) {
  const badge = formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: [],
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );

  return (
    <Badge variant={badge.variant}>
      {badge.kind === "withdrawn"
        ? `${badge.label} · ${formatAmount(inscription.allocatedAmount)}`
        : badge.label}
    </Badge>
  );
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}
