// PROTOTIPO — descartable. Ver issue #488.
//
// Variante B — "Panel de dos columnas".
// Identidad de la academia fija a la izquierda (siempre visible mientras
// scrolleás), contenido apilado a la derecha. Sin pestañas: todo se escanea
// de un vistazo. Jerarquía: la academia es un contexto persistente, no una
// ficha que se consulta.

import { ArrowUpRight, Mail, Phone, User } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

export const variantBName = "Panel de dos columnas";

export function VariantB({
  loaderData,
}: {
  loaderData: AcademyDetailPrototypeLoaderData;
}) {
  const { academy, counts, summary } = loaderData;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside className="flex w-full shrink-0 flex-col gap-5 lg:sticky lg:top-6 lg:w-72">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl leading-tight font-semibold">
            {academy.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Academia · {counts.dancers} bailarines
          </p>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <ContactLine icon={User} value={academy.contactName} />
          <ContactLine icon={Phone} value={academy.phone} />
          <ContactLine icon={Mail} value={academy.email ?? "—"} />
        </div>

        <Separator />

        <dl className="flex flex-col gap-3 text-sm">
          <StatLine
            label="Seña adeudada"
            value={formatOperationalAmount(summary.owedDepositAmount)}
          />
          <StatLine
            label="Saldo adeudado"
            value={formatOperationalAmount(summary.owedBalanceAmount)}
          />
          <StatLine
            label="Saldo disponible"
            value={formatAmount(summary.availableBalanceAmount)}
          />
        </dl>

        <Button asChild variant="outline" size="sm">
          <Link to={`/administracion/finanzas/${academy.id}`}>
            Ver resumen financiero
            <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <PanelSection
          title="Coreografías"
          count={counts.choreographies}
          emptyLabel="Sin coreografías en el evento activo."
        >
          <ul className="flex flex-col divide-y rounded-lg border bg-background">
            {loaderData.choreographies.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    to={`/administracion/finanzas/${academy.id}/coreografias/${row.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatGroupTypeLabel(row.groupType)} ·{" "}
                    {row.registrationCount} bailarines
                  </span>
                </div>
                <Badge
                  variant={getChoreographyFinancialStateBadgeVariant(
                    row.financialState,
                  )}
                >
                  {formatChoreographyFinancialState(row.financialState)}
                </Badge>
              </li>
            ))}
          </ul>
        </PanelSection>

        <PanelSection
          title="Bailarines"
          count={counts.dancers}
          emptyLabel="La academia todavía no cargó su plantel."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {loaderData.dancers.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <Link
                  to={`/administracion/bailarines/${row.id}`}
                  className="min-w-0 truncate text-sm font-medium hover:underline"
                >
                  {row.fullName}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {row.inscriptionCount} insc.
                </span>
              </li>
            ))}
          </ul>
        </PanelSection>
      </div>
    </div>
  );
}

function ContactLine({
  icon: Icon,
  value,
}: {
  icon: typeof User;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function PanelSection({
  children,
  count,
  emptyLabel,
  title,
}: {
  children: React.ReactNode;
  count: number;
  emptyLabel: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      {count > 0 ? (
        children
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}
