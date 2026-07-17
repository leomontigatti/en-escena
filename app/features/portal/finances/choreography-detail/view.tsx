import { ChevronLeft, CircleDollarSign, Landmark, Receipt } from "lucide-react";
import { Link } from "react-router";

import { MetricCard } from "@/components/shared/metric-card";
import {
  ReadOnlyDateField,
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
} from "@/features/admin/academies/account-current/formatters";
import type { loadPortalChoreographyFinanceDetail } from "@/features/portal/finances/choreography-detail/server";
import {
  formatChoreographyFinancialState,
  getChoreographyFinancialStateBadgeVariant,
} from "@/lib/finances/choreography-financial-state";
import { isTentativeInscriptionAmount } from "@/lib/finances/inscription-amounts";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";
import { cn } from "@/lib/shared/utils";

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
          value={formatOperationalAmount(choreography.balanceAmount)}
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
            <ReadOnlyDateField
              emptyLabel="Sin pago completo"
              label="Fecha de pago de la seña"
              value={choreography.depositCompletedOn}
            />
            <ReadOnlyField
              id="portal-finance-choreography-state"
              label="Estado"
              value={formatChoreographyFinancialState(
                choreography.financialState,
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <InscriptionsTable inscriptions={loaderData.inscriptions} />
    </section>
  );
}

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
              <TableHead className="text-right">Saldo</TableHead>
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
                    <Badge
                      variant={getChoreographyFinancialStateBadgeVariant(
                        inscription.state,
                      )}
                    >
                      {formatChoreographyFinancialState(inscription.state)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={amountCellClassName(
                      isTentativeInscriptionAmount(
                        inscription.state,
                        "basePrice",
                      ),
                    )}
                  >
                    {formatInscriptionAmount(inscription.basePriceAmount)}
                  </TableCell>
                  <TableCell
                    className={amountCellClassName(
                      isTentativeInscriptionAmount(
                        inscription.state,
                        "deposit",
                      ),
                    )}
                  >
                    {formatInscriptionAmount(inscription.depositAmount)}
                  </TableCell>
                  <TableCell
                    className={amountCellClassName(
                      isTentativeInscriptionAmount(
                        inscription.state,
                        "balance",
                      ),
                    )}
                  >
                    {formatInscriptionAmount(inscription.balanceAmount)}
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

function amountCellClassName(isTentative: boolean) {
  return cn("text-right tabular-nums", isTentative && "text-muted-foreground");
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}
