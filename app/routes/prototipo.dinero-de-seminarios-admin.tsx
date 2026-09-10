// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/890-seminar-money-admin`. Run `pnpm dev` and open
// `/prototipo/dinero-de-seminarios-admin` to see the admin surfaces of seminar
// money for wayfinder ticket #890 (map #884). No loader, no auth, no database:
// in-memory fixtures, every write a stub, and the real admin shell around the
// screens so each variant reads against the pages it will sit beside.
//
// The bar at the bottom switches everything, and the arrow keys cycle the
// variant. The search parameters it writes:
//   `pantalla`: `lista-seminarios`, `detalle-seminario`, `finanzas-lista`,
//     `finanzas-seminarios`, `finanzas-academia`, `finanzas-seminario`
//   `variante`: `A`, `B`, `C`
//   `caso`: `normal`, `lleno`, `sin-precios`
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import {
  AdminShell,
  type AdminShellBreadcrumbItem,
} from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FinancesListRouteView } from "@/features/admin/finances/list/view";
import { AcademyFinancesPrototype } from "@/features/admin/finances/prototype/academy-finances.prototype";
import { SeminarFinanceListPrototype } from "@/features/admin/finances/prototype/seminar-finance-list.prototype";
import { SeminarFinanceDetailPrototype } from "@/features/admin/finances/prototype/seminar-finance-detail.prototype";
import { SeminarDetailPrototype } from "@/features/admin/seminars/prototype/seminar-detail.prototype";
import { SeminarListPrototype } from "@/features/admin/seminars/prototype/seminar-list.prototype";
import {
  buildPrototypeData,
  prototypeCaseIds,
  type PrototypeCaseId,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";

import type { Route } from "./+types/prototipo.dinero-de-seminarios-admin";

/** Every write lands here and is refused, so nothing a real dialog does can persist. */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  return {
    intent,
    message: `Prototipo: no se guardó nada (${intent || "sin intent"}).`,
    status: "error" as const,
  };
}

const screens = {
  "lista-seminarios": {
    label: "Seminarios",
    variants: {
      A: "Cupo con lo que queda + Inscriptos",
      B: "Lugares ocupados de cupo + Inscriptos",
    },
  },
  "detalle-seminario": {
    label: "Seminario",
    variants: {
      A: "Pestaña Precios: tabla y diálogo",
      B: "Precios y seña dentro de Información",
      C: "Pestaña Precios: formulario con la seña",
    },
  },
  "finanzas-lista": {
    label: "Finanzas",
    variants: { A: "Sin cambios: cada academia suma los dos tipos" },
  },
  "finanzas-seminarios": {
    label: "Finanzas: seminarios",
    variants: { A: "Lista de cada academia en cada seminario" },
  },
  "finanzas-academia": {
    label: "Finanzas de la academia",
    variants: {
      A: "Pestañas Coreografías / Seminarios",
      B: "Una sola tabla con Tipo",
      C: "Dos secciones apiladas",
    },
  },
  "finanzas-seminario": {
    label: "Finanzas del seminario",
    variants: {
      A: "Precio + columna Precio aplicado",
      B: "Precio aplicado dentro del badge de Precio",
    },
  },
} satisfies {
  [screenId: string]: { label: string; variants: { [id: string]: string } };
};

type ScreenId = keyof typeof screens;

const screenIds = Object.keys(screens) as ScreenId[];

type Selection = {
  pantalla: ScreenId;
  variante: string;
  caso: PrototypeCaseId;
};

function readOption<TOption extends string>(
  value: string | null,
  options: readonly TOption[],
): TOption {
  return options.includes(value as TOption)
    ? (value as TOption)
    : (options[0] as TOption);
}

export default function SeminarMoneyAdminPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const screenId = readOption(searchParams.get("pantalla"), screenIds);
  const variantIds = useMemo(
    () => Object.keys(screens[screenId].variants),
    [screenId],
  );
  const selection: Selection = {
    pantalla: screenId,
    variante: readOption(searchParams.get("variante"), variantIds),
    caso: readOption(searchParams.get("caso"), prototypeCaseIds),
  };
  const data = useMemo(
    () => buildPrototypeData(selection.caso),
    [selection.caso],
  );
  const [log, setLog] = useState<string[]>([]);
  const record = useCallback((entry: string) => {
    setLog((current) => [entry, ...current].slice(0, 6));
  }, []);

  const { pantalla, variante, caso } = selection;
  // Moving to another screen starts on its first variant and drops the table's
  // own search, page and filter parameters.
  const buildHref = useCallback(
    (next: Partial<Selection>) => {
      const nextScreen = next.pantalla ?? pantalla;
      const params = new URLSearchParams({
        pantalla: nextScreen,
        variante: next.variante ?? (nextScreen === pantalla ? variante : "A"),
        caso: next.caso ?? caso,
      });

      return `?${params.toString()}`;
    },
    [caso, pantalla, variante],
  );
  const go = useCallback(
    (next: Partial<Selection>) => {
      setSearchParams(new URLSearchParams(buildHref(next).slice(1)), {
        preventScrollReset: true,
        replace: true,
      });
    },
    [buildHref, setSearchParams],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (
        target?.closest(
          "input, textarea, [contenteditable], [role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu'], [role='tablist']",
        )
      ) {
        return;
      }

      const offset = event.key === "ArrowRight" ? 1 : -1;
      const index = variantIds.indexOf(variante);
      go({
        variante:
          variantIds[(index + offset + variantIds.length) % variantIds.length],
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [go, variante, variantIds]);

  const seminarCrumb = { label: data.seminar.instructorName };
  const breadcrumbs: Record<ScreenId, AdminShellBreadcrumbItem[]> = {
    "lista-seminarios": [{ label: "Seminarios" }],
    "detalle-seminario": [
      {
        label: "Seminarios",
        to: buildHref({ pantalla: "lista-seminarios" }),
      },
      seminarCrumb,
    ],
    "finanzas-lista": [{ label: "Finanzas" }],
    "finanzas-seminarios": [
      { label: "Finanzas", to: buildHref({ pantalla: "finanzas-lista" }) },
      { label: "Seminarios" },
    ],
    "finanzas-academia": [
      { label: "Finanzas", to: buildHref({ pantalla: "finanzas-lista" }) },
      { label: data.academy.name },
    ],
    "finanzas-seminario": [
      { label: "Finanzas", to: buildHref({ pantalla: "finanzas-lista" }) },
      {
        label: data.academy.name,
        to: buildHref({ pantalla: "finanzas-academia" }),
      },
      { label: `Seminario ${data.seminar.instructorName}` },
    ],
  };
  const isFull = data.seminar.coveredCount >= data.seminar.quota;

  return (
    <AdminShell
      email="admin@prototipo.test"
      events={[
        { id: "evento-prototipo", name: "En Escena 2026", active: true },
      ]}
      selectedEventId="evento-prototipo"
      breadcrumbItems={breadcrumbs[pantalla]}
    >
      <div
        key={`${pantalla}-${variante}-${caso}`}
        className="flex flex-col gap-6 pb-56"
      >
        {pantalla === "lista-seminarios" ? (
          <SeminarListPrototype
            buildDetailHref={() => buildHref({ pantalla: "detalle-seminario" })}
            seminars={data.seminars}
            variant={variante}
          />
        ) : null}
        {pantalla === "detalle-seminario" ? (
          <SeminarDetailPrototype
            backHref={buildHref({ pantalla: "lista-seminarios" })}
            inscriptions={data.inscriptions}
            record={record}
            seminar={data.seminar}
            tierUsage={data.tierUsage}
            variant={variante}
          />
        ) : null}
        {pantalla === "finanzas-lista" ? (
          // The real list, fed the fixtures. Its academy links go to the real
          // route; use the bar to reach the prototype's academy screen.
          <FinancesListRouteView
            loaderData={
              {
                rows: data.financeAccounts,
                selectedEventId: "evento-prototipo",
              } as unknown as Parameters<
                typeof FinancesListRouteView
              >[0]["loaderData"]
            }
          />
        ) : null}
        {pantalla === "finanzas-seminarios" ? (
          <SeminarFinanceListPrototype
            buildDetailHref={() =>
              buildHref({ pantalla: "finanzas-seminario" })
            }
            rows={data.seminarAcademyRows}
          />
        ) : null}
        {pantalla === "finanzas-academia" ? (
          <AcademyFinancesPrototype
            academyName={data.academy.name}
            buildSeminarHref={() =>
              buildHref({ pantalla: "finanzas-seminario" })
            }
            choreographyRows={data.choreographyUnitRows}
            seminarRows={data.seminarUnitRows}
            summary={data.academySummary}
            variant={variante}
          />
        ) : null}
        {pantalla === "finanzas-seminario" ? (
          <SeminarFinanceDetailPrototype
            availableBalanceAmount={data.academySummary.availableBalanceAmount}
            inscriptions={data.academyInscriptions}
            isFull={isFull}
            record={record}
            seminar={data.seminar}
            variant={variante}
          />
        ) : null}

        <PrototypeState
          caso={caso}
          coveredCount={data.seminar.coveredCount}
          log={log}
          quota={data.seminar.quota}
          registeredCount={data.seminar.registeredCount}
          screenLabel={screens[pantalla].label}
          variantLabel={`${variante} — ${
            (screens[pantalla].variants as { [id: string]: string })[
              variante
            ] ?? ""
          }`}
        />
      </div>

      <SwitcherBar go={go} selection={selection} variantIds={variantIds} />
    </AdminShell>
  );
}

/** Rule 5 of the prototype skill: the state after every action. */
function PrototypeState({
  caso,
  coveredCount,
  log,
  quota,
  registeredCount,
  screenLabel,
  variantLabel,
}: {
  caso: string;
  coveredCount: number;
  log: string[];
  quota: number;
  registeredCount: number;
  screenLabel: string;
  variantLabel: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Estado del prototipo</CardTitle>
        <CardDescription>
          {screenLabel} · {variantLabel} · caso {caso}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        <p className="tabular-nums">
          Seminario Julieta Ruiz: cupo {quota} · con la seña cubierta{" "}
          {coveredCount} · inscriptos {registeredCount} · lugares libres{" "}
          {quota - coveredCount}
        </p>
        {log.length > 0 ? (
          <ul className="flex flex-col gap-1 font-mono text-muted-foreground">
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`} className="break-all">
                {entry}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Todavía no se guardó nada.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SwitcherBar({
  go,
  selection,
  variantIds,
}: {
  go: (next: Partial<Selection>) => void;
  selection: Selection;
  variantIds: string[];
}) {
  if (import.meta.env.PROD) {
    return null;
  }

  const index = variantIds.indexOf(selection.variante);
  const variants = screens[selection.pantalla].variants as {
    [id: string]: string;
  };
  const cycle = (offset: number) =>
    go({
      variante:
        variantIds[(index + offset + variantIds.length) % variantIds.length],
    });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-4xl flex-col gap-2 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
        <SwitcherRow
          legend="Pantalla"
          options={screenIds.map((id) => ({ id, label: screens[id].label }))}
          activeId={selection.pantalla}
          onSelect={(id) => go({ pantalla: id as ScreenId })}
        />
        <div className="flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Variante</span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label="Variante anterior"
            onClick={() => cycle(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="min-w-72 text-center font-medium">
            {selection.variante} — {variants[selection.variante]}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label="Variante siguiente"
            onClick={() => cycle(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <SwitcherRow
          legend="Caso"
          options={prototypeCaseIds.map((id) => ({ id, label: id }))}
          activeId={selection.caso}
          onSelect={(id) => go({ caso: id as PrototypeCaseId })}
        />
      </div>
    </div>
  );
}

function SwitcherRow({
  activeId,
  legend,
  onSelect,
  options,
}: {
  activeId: string;
  legend: string;
  onSelect: (id: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 text-muted-foreground">{legend}</span>
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="xs"
          variant={option.id === activeId ? "default" : "outline"}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
