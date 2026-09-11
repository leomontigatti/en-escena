// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/890-seminar-money-admin`. Run `pnpm dev` and open
// `/prototipo/dinero-de-seminarios-admin` to see the admin surfaces of seminar
// money for wayfinder ticket #890 (map #884). No loader, no auth, no database:
// in-memory fixtures, every write a stub, and the real admin shell around the
// screens so each variant reads against the pages it will sit beside.
//
// The bar at the bottom switches everything, and the arrow keys cycle the
// variant. The search parameters it writes:
//   `pantalla`: `lista-seminarios`, `detalle-seminario`, `precios`,
//     `precio-seminario`, `finanzas-lista`, `finanzas-academia`,
//     `finanzas-seminario`
//   `variante`: `A` or `B` where a screen still offers two
//   `caso`: `normal`, `lleno`, `falta-precio`
//   `pestana`: `coreografias` or `seminarios`, on `precios`
//   `precio`: the seminar price row on `precio-seminario`, empty for a new one
//
// Reworked after the event-level seminar prices of #904: prices live in a tab
// of `Bases del evento` › `Precios`, the seminar gains its kind.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActionData, useSearchParams } from "react-router";

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
import {
  EventPricesPrototype,
  eventPricesTabs,
  refuseSeminarPriceDelete,
  SeminarPriceFormPrototype,
  type EventPricesTab,
} from "@/features/admin/prices/prototype/event-prices.prototype";
import { AcademyFinancesPrototype } from "@/features/admin/finances/prototype/academy-finances.prototype";
import { SeminarFinanceDetailPrototype } from "@/features/admin/finances/prototype/seminar-finance-detail.prototype";
import { SeminarDetailPrototype } from "@/features/admin/seminars/prototype/seminar-detail.prototype";
import { SeminarListPrototype } from "@/features/admin/seminars/prototype/seminar-list.prototype";
import {
  buildPrototypeData,
  formatParticipantsLabel,
  formatSeminarKindLabel,
  getSeminarPriceDisplayName,
  prototypeCaseIds,
  type PrototypeCaseId,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/prototipo.dinero-de-seminarios-admin";

/**
 * Every write lands here and nothing persists. Deleting a seminar price answers
 * with the guard the case's fixtures would trip, so variant A's refusal reads as
 * the choreography price's does today.
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete-seminar-price") {
    const data = buildPrototypeData(
      readOption(
        new URL(request.url).searchParams.get("caso"),
        prototypeCaseIds,
      ),
    );
    const priceId = String(formData.get("id") ?? "");
    const price = data.seminarPrices.find((row) => row.id === priceId);
    const refusal = price
      ? refuseSeminarPriceDelete(price, data.priceUsage[price.id])
      : null;

    return {
      intent,
      message: refusal ?? "Prototipo: se habría borrado el precio.",
      status: refusal ? ("error" as const) : ("success" as const),
    };
  }

  return {
    intent,
    message: `Prototipo: no se guardó nada (${intent || "sin intent"}).`,
    status: "error" as const,
  };
}

const screens = {
  "lista-seminarios": {
    label: "Seminarios",
    variants: { A: "Cupo con lo que queda + Inscriptos" },
  },
  "detalle-seminario": {
    label: "Seminario",
    variants: {
      A: "Tipo y Seña (%) apilados, la foto a su derecha",
      B: "Tipo junto al instructor, Cupo junto a Seña (%)",
    },
  },
  precios: {
    label: "Precios",
    variants: { A: "Pestañas Coreografías / Seminarios" },
  },
  "precio-seminario": {
    label: "Precio de seminario",
    variants: {
      A: "Rechazo al guardar o borrar, como el precio de coreografía",
      B: "Campos bloqueados a la vista, borrado bloqueado",
    },
  },
  "finanzas-lista": {
    label: "Finanzas",
    variants: { A: "Sin cambios: cada academia suma los dos tipos" },
  },
  "finanzas-academia": {
    label: "Finanzas de la academia",
    variants: {
      A: "Pestañas Coreografías / Seminarios, métricas por pestaña",
    },
  },
  "finanzas-seminario": {
    label: "Finanzas del seminario",
    variants: { A: "El precio efectivo dentro del badge de Precio" },
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
  pestana: EventPricesTab;
  precio: string;
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
    pestana: readOption(searchParams.get("pestana"), eventPricesTabs),
    precio: searchParams.get("precio") ?? "",
  };
  const data = useMemo(
    () => buildPrototypeData(selection.caso),
    [selection.caso],
  );
  const [log, setLog] = useState<string[]>([]);
  const record = useCallback((entry: string) => {
    setLog((current) => [entry, ...current].slice(0, 6));
  }, []);

  const actionData = useActionData<typeof action>();
  useServerActionToast(actionData);

  const { pantalla, variante, caso, pestana, precio } = selection;
  // Moving to another screen starts on its first variant and drops the table's
  // own search, page and filter parameters.
  const buildHref = useCallback(
    (next: Partial<Selection>) => {
      const nextScreen = next.pantalla ?? pantalla;
      const params = new URLSearchParams({
        pantalla: nextScreen,
        variante: next.variante ?? (nextScreen === pantalla ? variante : "A"),
        caso: next.caso ?? caso,
        pestana: next.pestana ?? pestana,
        precio: next.precio ?? precio,
      });

      return `?${params.toString()}`;
    },
    [caso, pantalla, pestana, precio, variante],
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
  const selectedPrice =
    data.seminarPrices.find((row) => row.id === precio) ?? null;
  const pricesHref = buildHref({
    pantalla: "precios",
    pestana: "seminarios",
    precio: "",
  });
  const breadcrumbs: Record<ScreenId, AdminShellBreadcrumbItem[]> = {
    "lista-seminarios": [{ label: "Seminarios" }],
    "detalle-seminario": [
      {
        label: "Seminarios",
        to: buildHref({ pantalla: "lista-seminarios" }),
      },
      seminarCrumb,
    ],
    precios: [{ label: "Precios" }],
    "precio-seminario": [
      { label: "Precios", to: pricesHref },
      {
        label: selectedPrice
          ? getSeminarPriceDisplayName(selectedPrice)
          : "Nuevo precio",
      },
    ],
    "finanzas-lista": [{ label: "Finanzas" }],
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
        key={`${pantalla}-${variante}-${caso}-${precio}`}
        className="flex flex-col gap-6 pb-56"
      >
        {pantalla === "lista-seminarios" ? (
          <SeminarListPrototype
            buildDetailHref={() => buildHref({ pantalla: "detalle-seminario" })}
            seminars={data.seminars}
          />
        ) : null}
        {pantalla === "detalle-seminario" ? (
          <SeminarDetailPrototype
            backHref={buildHref({ pantalla: "lista-seminarios" })}
            inscriptions={data.inscriptions}
            record={record}
            seminar={data.seminar}
            variant={variante}
          />
        ) : null}
        {pantalla === "precios" ? (
          <EventPricesPrototype
            activeTab={pestana}
            buildEditHref={(priceId) =>
              buildHref({ pantalla: "precio-seminario", precio: priceId })
            }
            choreographyPrices={data.choreographyPrices}
            missingBaseCells={data.missingBaseCells}
            newSeminarPriceHref={buildHref({
              pantalla: "precio-seminario",
              precio: "",
            })}
            onTabChange={(tab) => go({ pestana: tab })}
            seminarPrices={data.seminarPrices}
          />
        ) : null}
        {pantalla === "precio-seminario" ? (
          <SeminarPriceFormPrototype
            backHref={pricesHref}
            price={selectedPrice}
            record={record}
            usage={
              selectedPrice ? data.priceUsage[selectedPrice.id] : undefined
            }
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
        {pantalla === "finanzas-academia" ? (
          <AcademyFinancesPrototype
            academyName={data.academy.name}
            buildSeminarHref={() =>
              buildHref({ pantalla: "finanzas-seminario" })
            }
            choreographyRows={data.choreographyUnitRows}
            seminarRows={data.seminarUnitRows}
            availableBalanceAmount={data.academySummary.availableBalanceAmount}
          />
        ) : null}
        {pantalla === "finanzas-seminario" ? (
          <SeminarFinanceDetailPrototype
            availableBalanceAmount={data.academySummary.availableBalanceAmount}
            inscriptions={data.academyInscriptions}
            isFull={isFull}
            prices={data.seminarPrices}
            record={record}
            seminar={data.seminar}
          />
        ) : null}

        <PrototypeState
          caso={caso}
          pricesLine={`Precios de seminario del evento: ${data.seminarPrices.length} · ${
            data.missingBaseCells.length > 0
              ? `falta el común sin fecha límite para ${data.missingBaseCells
                  .map((cell) => formatParticipantsLabel(cell).toLowerCase())
                  .join(" y para ")}, los seminarios no abren`
              : "los dos comunes sin fecha límite están, los seminarios abren"
          }`}
          seminarKindLabel={formatSeminarKindLabel(data.seminar.kind)}
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
  pricesLine,
  quota,
  registeredCount,
  screenLabel,
  seminarKindLabel,
  variantLabel,
}: {
  caso: string;
  coveredCount: number;
  log: string[];
  pricesLine: string;
  quota: number;
  registeredCount: number;
  screenLabel: string;
  seminarKindLabel: string;
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
          Seminario Julieta Ruiz ({seminarKindLabel}): cupo {quota} · con la
          seña cubierta {coveredCount} · inscriptos {registeredCount} · lugares
          libres {quota - coveredCount}
        </p>
        <p>{pricesLine}</p>
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
