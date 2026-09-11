// PROTOTYPE — throwaway, lives only on branch `prototype/891-seminar-money-portal`.
//
// Part of the portal seminar-money prototype for wayfinder ticket #891 (map #884),
// second round: the seminar detail the poster card's `Ver detalle` opens. It is
// the academy's half of the admin seminar detail (`Inscriptos` tab) — only this
// academy's inscriptions — and it is where the chips, the prices and the deposit
// went when the card was stripped back. The three variants disagree about how
// much of the money it says, given the financial detail already exists under
// `Resumen`.
import { Info, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";

import { PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { MetricCard } from "@/components/shared/metric-card";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
  type InscriptionFinanceRow,
} from "@/lib/finances/inscription-finance-columns";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { seminarStartedMessage } from "@/lib/seminars/registration-refusals";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  RegisterDialogPrototype,
  WithdrawDialog,
} from "./seminar-cards.prototype";
import {
  depositFor,
  formatPriceDeadline,
  formatSeminarKindLabel,
  isSeminarFull,
  listActiveInscriptions,
  type PortalMoneySeminar,
  type SeminarInscriptionFigures,
  type SeminarPriceRow,
} from "./seminar-money-portal-fixtures.prototype";

export type SeminarDetailVariantId = "A" | "B" | "C";

type PrototypeActionData =
  | { intent: string; message: string; status: "error" | "success" }
  | undefined;

export function PortalSeminarDetailPrototype({
  seminar,
  variant,
}: {
  seminar: PortalMoneySeminar;
  variant: SeminarDetailVariantId;
}) {
  const fetcher = useFetcher<PrototypeActionData>();
  const [isRegistering, setIsRegistering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const active = listActiveInscriptions(seminar);
  const removing = active.find((row) => row.id === removingId) ?? null;

  useServerActionToast(fetcher.data);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.status === "success") {
      setIsRegistering(false);
    }
  }, [fetcher.data, fetcher.state]);

  const canRemove = !seminar.hasStarted;
  const onRemove = (inscriptionId: string) => setRemovingId(inscriptionId);

  return (
    <>
      <PortalListPage
        titleId="seminario-title"
        title={seminar.instructorName}
        description={`${formatDate(seminar.scheduledDate)} · ${seminar.startTime}. Revisá los datos del seminario y la gente de tu academia que inscribiste.`}
        action={
          seminar.hasStarted ? null : (
            <Button type="button" onClick={() => setIsRegistering(true)}>
              <Plus aria-hidden="true" data-icon />
              Inscribir
            </Button>
          )
        }
      >
        {seminar.hasStarted ? (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              {seminarStartedMessage} Ya no se puede inscribir ni dar de baja.
            </AlertDescription>
          </Alert>
        ) : null}
        {isSeminarFull(seminar) && !seminar.hasStarted ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              Cupo completo: podés inscribir igual, pero la seña de una nueva
              inscripción no se cubre hasta que se libere un lugar.
            </AlertDescription>
          </Alert>
        ) : null}

        {variant === "A" ? (
          <TabbedDetail
            active={active}
            canRemove={canRemove}
            onRemove={onRemove}
            seminar={seminar}
          />
        ) : null}
        {variant === "B" ? (
          <OnePageDetail
            active={active}
            canRemove={canRemove}
            onRemove={onRemove}
            seminar={seminar}
          />
        ) : null}
        {variant === "C" ? (
          <MetricsDetail
            active={active}
            canRemove={canRemove}
            onRemove={onRemove}
            seminar={seminar}
          />
        ) : null}
      </PortalListPage>

      {isRegistering ? (
        <RegisterDialogPrototype
          isSubmitting={fetcher.state !== "idle"}
          onClose={() => setIsRegistering(false)}
          seminar={seminar}
          submit={fetcher.submit}
          variant="C"
        />
      ) : null}

      {removing && removing.allocatedAmount === 0 ? (
        <DeleteDialog
          title={removing.person.fullName}
          description={`Esta acción da de baja la inscripción en el seminario de ${seminar.instructorName}. No se puede deshacer.`}
          intentValue="delete-seminar-inscription"
          recordId={removing.id}
          open
          onOpenChange={(nextOpen) => (nextOpen ? null : setRemovingId(null))}
        />
      ) : null}
      {removing && removing.allocatedAmount > 0 ? (
        <WithdrawDialog
          inscription={removing}
          instructorName={seminar.instructorName}
          onOpenChange={(nextOpen) => (nextOpen ? null : setRemovingId(null))}
        />
      ) : null}
    </>
  );
}

type DetailVariantProps = {
  active: SeminarInscriptionFigures[];
  canRemove: boolean;
  onRemove: (inscriptionId: string) => void;
  seminar: PortalMoneySeminar;
};

/** The name is the only action on a row, as on the admin table. */
function nameColumn({
  canRemove,
  onRemove,
}: Pick<
  DetailVariantProps,
  "canRemove" | "onRemove"
>): DataTableColumn<SeminarInscriptionFigures> {
  return {
    id: "fullName",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) =>
      canRemove ? (
        <Button
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={() => onRemove(row.id)}
        >
          {row.person.fullName}
        </Button>
      ) : (
        row.person.fullName
      ),
    filterValue: (row) => row.person.fullName,
    sortValue: (row) => row.person.fullName,
  };
}

const kindColumn: DataTableColumn<SeminarInscriptionFigures> = {
  id: "personKind",
  header: "Tipo",
  cell: (row) => (
    <Badge variant="secondary">
      {row.person.kind === "professor" ? "Profesor" : "Bailarín"}
    </Badge>
  ),
};

const statusColumn: DataTableColumn<SeminarInscriptionFigures> = {
  id: "financialStatus",
  header: "Estado",
  cell: (row) => {
    const badge = formatInscriptionStatusBadge(
      resolveInscriptionStatusBadge({
        anomalies: [],
        financialStatus: row.financialStatus,
        withdrawn: row.withdrawn,
      }),
    );

    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  },
};

function InscriptionsTable({
  columns,
  rows,
}: {
  columns: DataTableColumn<SeminarInscriptionFigures>[];
  rows: SeminarInscriptionFigures[];
}) {
  return (
    <ClientDataTable
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.id}
      searchPlaceholder="Buscar inscripto por nombre"
      emptyMessage="Todavía no inscribiste a nadie en este seminario."
      initialSort={{ columnId: "fullName", direction: "asc" }}
    />
  );
}

function priceValue(price: SeminarPriceRow | null, rate: number) {
  if (!price) {
    return "Sin precio";
  }

  return `${formatAmount(price.amount)} · seña ${formatAmount(depositFor(price.amount, rate))} · ${formatPriceDeadline(price.paymentDeadline).toLowerCase()}`;
}

/**
 * A — the admin detail's shape, read-only: `Información` holds the seminar's
 * data and its two prices as locked fields, `Inscriptos` is the flat table with
 * `Nombre` and `Tipo` only. Money stays entirely in `Resumen`.
 */
function TabbedDetail({
  active,
  canRemove,
  onRemove,
  seminar,
}: DetailVariantProps) {
  return (
    <Tabs defaultValue="informacion">
      <TabsList variant="line">
        <TabsTrigger value="informacion">Información</TabsTrigger>
        <TabsTrigger value="inscriptos">Inscriptos</TabsTrigger>
      </TabsList>
      <TabsContent value="informacion" className="pt-2">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Instructor" value={seminar.instructorName} />
            <ReadOnlyField
              label="Tipo de seminario"
              value={formatSeminarKindLabel(seminar.kind)}
            />
            <ReadOnlyField
              label="Fecha"
              value={formatDate(seminar.scheduledDate)}
            />
            <ReadOnlyField label="Hora" value={seminar.startTime} />
            <ReadOnlyField
              label="Precio para participantes"
              value={priceValue(
                seminar.currentPrices.participants,
                seminar.requiredDepositPercentage,
              )}
            />
            <ReadOnlyField
              label="Precio para no participantes"
              value={priceValue(
                seminar.currentPrices.nonParticipants,
                seminar.requiredDepositPercentage,
              )}
            />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="inscriptos" className="pt-2">
        <InscriptionsTable
          columns={[nameColumn({ canRemove, onRemove }), kindColumn]}
          rows={active}
        />
      </TabsContent>
    </Tabs>
  );
}

type MoneyRow = InscriptionFinanceRow & {
  inscription: SeminarInscriptionFigures;
};

/**
 * B — one page, and the money is here: the seminar's data as a short list on
 * top, the inscriptions with the same five money columns the financial detail
 * uses. It makes the seminar's financial detail redundant for the academy.
 */
function OnePageDetail({
  active,
  canRemove,
  onRemove,
  seminar,
}: DetailVariantProps) {
  const rows: MoneyRow[] = active.map((inscription) => ({
    allocatedAmount: inscription.allocatedAmount,
    anomalies: [],
    depositAmount: inscription.depositAmount,
    effectivePrice: inscription.price ? { name: inscription.price.name } : null,
    financialStatus: inscription.financialStatus,
    inscription,
    owedBalanceAmount: inscription.owedBalanceAmount,
    totalAmount: inscription.totalAmount,
    withdrawn: inscription.withdrawn,
  }));
  const columns: DataTableColumn<MoneyRow>[] = [
    {
      id: "fullName",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) =>
        canRemove ? (
          <Button
            variant="link"
            className="h-auto p-0 font-medium"
            onClick={() => onRemove(row.inscription.id)}
          >
            {row.inscription.person.fullName}
          </Button>
        ) : (
          row.inscription.person.fullName
        ),
      filterValue: (row) => row.inscription.person.fullName,
      sortValue: (row) => row.inscription.person.fullName,
    },
    {
      id: "personKind",
      header: "Tipo",
      cell: (row) => (
        <Badge variant="secondary">
          {row.inscription.person.kind === "professor"
            ? "Profesor"
            : "Bailarín"}
        </Badge>
      ),
    },
    ...inscriptionFinanceColumns,
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-3 sm:grid-cols-2">
        <SeminarFact label="Tipo de seminario">
          {formatSeminarKindLabel(seminar.kind)}
        </SeminarFact>
        <SeminarFact label="Seña">
          {seminar.requiredDepositPercentage}% del precio
        </SeminarFact>
        <SeminarFact label="Precio para participantes">
          {priceValue(
            seminar.currentPrices.participants,
            seminar.requiredDepositPercentage,
          )}
        </SeminarFact>
        <SeminarFact label="Precio para no participantes">
          {priceValue(
            seminar.currentPrices.nonParticipants,
            seminar.requiredDepositPercentage,
          )}
        </SeminarFact>
      </dl>

      <section aria-label="Inscriptos">
        <ClientDataTable
          rows={rows}
          columns={columns}
          facetedFilters={inscriptionFinanceFacetedFilters}
          getRowKey={(row) => row.inscription.id}
          searchPlaceholder="Buscar inscripto por nombre"
          textFilterColumnId="fullName"
          emptyMessage="Todavía no inscribiste a nadie en este seminario."
          initialSort={{ columnId: "fullName", direction: "asc" }}
        />
      </section>
    </div>
  );
}

function SeminarFact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * C — the prices as the metric cards the finance screens already use, and the
 * table says `Estado` but no amounts: enough to see who still owes a deposit,
 * with the figures themselves one click away in `Resumen`.
 */
function MetricsDetail({
  active,
  canRemove,
  onRemove,
  seminar,
}: DetailVariantProps) {
  const participants = seminar.currentPrices.participants;
  const nonParticipants = seminar.currentPrices.nonParticipants;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Precio participantes"
          value={
            participants ? formatAmount(participants.amount) : "Sin precio"
          }
        />
        <MetricCard
          title="Precio no participantes"
          value={
            nonParticipants
              ? formatAmount(nonParticipants.amount)
              : "Sin precio"
          }
        />
        <MetricCard
          title="Seña"
          value={`${seminar.requiredDepositPercentage}%`}
        />
        <MetricCard
          title="Los precios cambian"
          value={formatPriceDeadline(
            [participants?.paymentDeadline, nonParticipants?.paymentDeadline]
              .filter((deadline): deadline is string => Boolean(deadline))
              .sort()[0] ?? null,
          ).replace("Hasta el ", "El ")}
        />
      </section>

      <section aria-label="Inscriptos">
        <InscriptionsTable
          columns={[
            nameColumn({ canRemove, onRemove }),
            kindColumn,
            statusColumn,
          ]}
          rows={active}
        />
      </section>
    </div>
  );
}
