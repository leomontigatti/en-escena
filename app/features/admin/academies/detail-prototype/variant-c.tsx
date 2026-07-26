// PROTOTIPO — descartable. Ver issue #488.
//
// Variante C — "Triage".
// Invierte la jerarquía: arriba va lo que necesita acción (coreografías
// impagas, identidades sin verificar, seña adeudada), y los datos de contacto
// quedan al pie. Parte de la premisa de que quien abre una academia en admin
// viene a resolver algo, no a leer una ficha.

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/features/admin/finances/academy-detail/formatters";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import type { AcademyDetailPrototypeLoaderData } from "./server";

export const variantCName = "Triage de pendientes";

export function VariantC({
  loaderData,
}: {
  loaderData: AcademyDetailPrototypeLoaderData;
}) {
  const { academy, counts, summary } = loaderData;
  const unpaid = loaderData.choreographies.filter(
    (row) => row.financialState === "impaga",
  );
  const partiallyPaid = loaderData.choreographies.filter(
    (row) => row.financialState === "señada",
  );
  const unverified = loaderData.dancers.filter((row) => !row.identityVerified);
  const hasPending =
    unpaid.length > 0 || partiallyPaid.length > 0 || unverified.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl leading-tight font-semibold">
          {academy.name}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{counts.choreographies} coreografías</span>
          <span>{counts.dancers} bailarines</span>
          <span>{counts.inscriptions} inscripciones</span>
        </p>
      </header>

      {hasPending ? (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
            <AlertTriangle
              className="size-4 text-destructive"
              aria-hidden="true"
            />
            Requiere atención
          </h2>

          <TriageGroup
            title="Coreografías impagas"
            count={unpaid.length}
            detail={formatOperationalAmount(summary.owedDepositAmount)}
            detailLabel="seña adeudada"
          >
            {unpaid.map((row) => (
              <TriageRow
                key={row.id}
                to={`/administracion/finanzas/${academy.id}/coreografias/${row.id}`}
                primary={row.name}
                secondary={`${formatGroupTypeLabel(row.groupType)} · ${row.registrationCount} bailarines`}
                trailing={formatOperationalAmount(row.owedDepositAmount)}
              />
            ))}
          </TriageGroup>

          <TriageGroup
            title="Coreografías con saldo pendiente"
            count={partiallyPaid.length}
            detail={formatOperationalAmount(summary.owedBalanceAmount)}
            detailLabel="saldo adeudado"
          >
            {partiallyPaid.map((row) => (
              <TriageRow
                key={row.id}
                to={`/administracion/finanzas/${academy.id}/coreografias/${row.id}`}
                primary={row.name}
                secondary={`${formatGroupTypeLabel(row.groupType)} · ${row.registrationCount} bailarines`}
                trailing={formatOperationalAmount(row.owedBalanceAmount)}
              />
            ))}
          </TriageGroup>

          <TriageGroup
            title="Bailarines sin identidad verificada"
            count={unverified.length}
          >
            {unverified.map((row) => (
              <TriageRow
                key={row.id}
                to={`/administracion/bailarines/${row.id}`}
                primary={row.fullName}
                secondary={row.documentNumber ?? "Sin documento cargado"}
                trailing={`${row.inscriptionCount} insc.`}
              />
            ))}
          </TriageGroup>
        </section>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <span>No hay pendientes para esta academia en el evento activo.</span>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold">Al día</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">
            {counts.choreographies - unpaid.length - partiallyPaid.length}{" "}
            coreografías pagadas
          </Badge>
          <Badge variant="secondary">
            {formatAmount(summary.availableBalanceAmount)} disponible
          </Badge>
          <Badge variant="secondary">
            {formatAmount(summary.totalPaidAmount)} cobrado
          </Badge>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link to={`/administracion/finanzas/${academy.id}`}>
            Ver resumen financiero completo
            <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      </section>

      <details className="rounded-lg border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
          Datos de contacto
          <ChevronDown className="size-4" aria-hidden="true" />
        </summary>
        <dl className="grid gap-3 border-t px-4 py-3 text-sm sm:grid-cols-2">
          <ContactPair label="Nombre de contacto" value={academy.contactName} />
          <ContactPair label="Teléfono" value={academy.phone} />
          <ContactPair label="Email de acceso" value={academy.email ?? "—"} />
        </dl>
      </details>
    </div>
  );
}

function TriageGroup({
  children,
  count,
  detail,
  detailLabel,
  title,
}: {
  children: React.ReactNode;
  count: number;
  detail?: string;
  detailLabel?: string;
  title: string;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          {title}{" "}
          <span className="text-muted-foreground tabular-nums">({count})</span>
        </h3>
        {detail ? (
          <span className="text-sm text-muted-foreground">
            {detail} <span className="text-xs">{detailLabel}</span>
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y rounded-lg border bg-background">
        {children}
      </ul>
    </div>
  );
}

function TriageRow({
  primary,
  secondary,
  to,
  trailing,
}: {
  primary: string;
  secondary: string;
  to: string;
  trailing: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{primary}</span>
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        </div>
        <span className="shrink-0 text-sm tabular-nums">{trailing}</span>
      </Link>
    </li>
  );
}

function ContactPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
