// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/891-seminar-money-portal`. Run `pnpm dev` and open
// `/prototipo/dinero-de-seminarios-portal` to see the academy portal surfaces of
// seminar money for wayfinder ticket #891 (map #884). No loader, no auth, no
// database: in-memory fixtures, every write a stub, and the real portal shell
// around the screens so each variant reads against its cousins.
//
// The bar at the bottom switches everything, and the arrow keys cycle the
// variant. The search parameters it writes:
//   `pantalla`: `seminarios`, `inscribir`, `resumen`, `resumen-seminario`
//   `variante`: `A`, `B`, `C` (only `A` on `resumen-seminario`)
//   `caso`: `normal`, `lleno` (the covered rows fill Julieta Ruiz's quota),
//     `comenzado` (Julieta Ruiz's seminar has started)
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useActionData, useSearchParams } from "react-router";

import {
  PortalShell,
  type PortalShellBreadcrumbItem,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PortalAcademyFinancesPrototype,
  type FinancesVariantId,
} from "@/features/portal/finances/prototype/academy-finances.prototype";
import { PortalSeminarFinanceDetailPrototype } from "@/features/portal/finances/prototype/seminar-finance-detail.prototype";
import {
  PortalSeminarsMoneyPrototype,
  type CardVariantId,
  type DialogVariantId,
} from "@/features/portal/seminars/prototype/seminar-cards.prototype";
import {
  PortalSeminarDetailPrototype,
  type SeminarDetailVariantId,
} from "@/features/portal/seminars/prototype/seminar-detail.prototype";
import {
  buildPrototypeData,
  formatSeminarKindLabel,
  getTargetSeminar,
  isRevivalRefused,
  prototypeCaseIds,
  prototypeToday,
  type PrototypeCaseId,
} from "@/features/portal/seminars/prototype/seminar-money-portal-fixtures.prototype";
import { formatInscriptionFinancialStatus } from "@/lib/finances/choreography-financial-status";
import { seminarFullMessage } from "@/lib/seminars/registration-refusals";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/prototipo.dinero-de-seminarios-portal";

const stubMessages: Record<string, string> = {
  "register-seminar-inscription":
    "Prototipo: se habría inscripto a la persona.",
  "delete-seminar-inscription": "Prototipo: se habría borrado la inscripción.",
  "withdraw-seminar-inscription":
    "Prototipo: se habría retirado la inscripción; su dinero sigue asignado.",
};

/**
 * Every write lands here and nothing persists. Registering someone whose
 * withdrawn row would retake a place the seminar no longer has answers with the
 * no-places refusal (#889): Joaquín Ríos on `caso=lleno`.
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "register-seminar-inscription") {
    const data = buildPrototypeData(
      readOption(
        new URL(request.url).searchParams.get("caso"),
        prototypeCaseIds,
      ),
    );
    const seminar = data.seminars.find(
      (row) => row.id === String(formData.get("seminarId") ?? ""),
    );

    if (
      seminar &&
      isRevivalRefused(seminar, String(formData.get("person") ?? ""))
    ) {
      return { intent, message: seminarFullMessage, status: "error" as const };
    }
  }

  const message = stubMessages[intent];

  return message
    ? { intent, message, status: "success" as const }
    : {
        intent,
        message: `Prototipo: no se guardó nada (${intent || "sin intent"}).`,
        status: "error" as const,
      };
}

const screens = {
  seminarios: {
    label: "Seminarios",
    variants: {
      C: "Elegida: afiche con Ver detalle e Inscribir",
      A: "Ronda 1: precios como cifras arriba, chips con estado",
      B: "Ronda 1: inscriptos en filas con lo adeudado",
    },
  },
  "detalle-seminario": {
    label: "Detalle del seminario",
    variants: {
      A: "Pestañas Información / Inscriptos, como en administración",
      B: "Una sola página: datos arriba, inscriptos con su dinero",
      C: "Precios como métricas, inscriptos con estado",
    },
  },
  inscribir: {
    label: "Inscribir",
    variants: {
      A: "Lo que pagaría, debajo del selector",
      B: "Selector agrupado por participante, con el precio",
      C: "Sin precio en el diálogo",
    },
  },
  resumen: {
    label: "Resumen",
    variants: {
      A: "Pestañas, como en administración",
      B: "Una sola lista con los dos tipos",
      C: "Pestañas; seminarios por inscripción, sin detalle",
    },
  },
  "resumen-seminario": {
    label: "Detalle del seminario",
    variants: { A: "Gemelo del detalle de coreografía" },
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

const prototypeEventContext = {
  activeEvent: {
    id: "evento-prototipo",
    name: "En Escena 2026",
    active: true,
    registrationStartsAt: new Date("2026-08-01T03:00:00Z"),
    registrationEndsAt: new Date("2026-10-01T03:00:00Z"),
    startsAt: new Date("2026-10-12T03:00:00Z"),
    endsAt: new Date("2026-10-18T03:00:00Z"),
  },
};

function readOption<TOption extends string>(
  value: string | null,
  options: readonly TOption[],
): TOption {
  return options.includes(value as TOption)
    ? (value as TOption)
    : (options[0] as TOption);
}

export default function SeminarMoneyPortalPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pantalla = readOption(searchParams.get("pantalla"), screenIds);
  const variantIds = useMemo(
    () => Object.keys(screens[pantalla].variants),
    [pantalla],
  );
  const variante = readOption(searchParams.get("variante"), variantIds);
  const caso = readOption(searchParams.get("caso"), prototypeCaseIds);
  const data = useMemo(() => buildPrototypeData(caso), [caso]);
  const target = getTargetSeminar(data);

  const actionData = useActionData<typeof action>();
  useServerActionToast(actionData);

  // Moving to another screen starts on its first variant and drops the table's
  // own search, page and filter parameters.
  const buildHref = useCallback(
    (next: Partial<Selection>) => {
      const nextScreen = next.pantalla ?? pantalla;
      const params = new URLSearchParams({
        pantalla: nextScreen,
        variante:
          next.variante ??
          (nextScreen === pantalla
            ? variante
            : (Object.keys(screens[nextScreen].variants)[0] ?? "A")),
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

      const eventTarget = event.target as HTMLElement | null;

      if (
        eventTarget?.closest(
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

  const financeDetailHref = buildHref({ pantalla: "resumen-seminario" });
  const seminarDetailHref = buildHref({ pantalla: "detalle-seminario" });
  const breadcrumbs: Record<ScreenId, PortalShellBreadcrumbItem[]> = {
    seminarios: [{ label: "Seminarios" }],
    "detalle-seminario": [
      { label: "Seminarios", to: buildHref({ pantalla: "seminarios" }) },
      { label: target.instructorName },
    ],
    inscribir: [{ label: "Seminarios" }],
    resumen: [{ label: "Resumen" }],
    "resumen-seminario": [
      { label: "Resumen", to: buildHref({ pantalla: "resumen" }) },
      { label: target.instructorName },
    ],
  };

  return (
    <PortalShell
      userEmail="contacto@danzasur.test"
      contactName="Marina Sur"
      academyName={data.academyName}
      eventContext={prototypeEventContext}
      breadcrumbItems={breadcrumbs[pantalla]}
    >
      <div
        key={`${pantalla}-${variante}-${caso}`}
        className="flex flex-col gap-6 pb-56"
      >
        {pantalla === "seminarios" || pantalla === "inscribir" ? (
          <PortalSeminarsMoneyPrototype
            cardVariant={
              pantalla === "seminarios" ? (variante as CardVariantId) : "A"
            }
            dialogVariant={
              pantalla === "inscribir" ? (variante as DialogVariantId) : "A"
            }
            initialOpenSeminarId={pantalla === "inscribir" ? target.id : null}
            seminarDetailHref={seminarDetailHref}
            seminars={data.seminars}
          />
        ) : null}
        {pantalla === "detalle-seminario" ? (
          <PortalSeminarDetailPrototype
            seminar={target}
            variant={variante as SeminarDetailVariantId}
          />
        ) : null}
        {pantalla === "resumen" ? (
          <PortalAcademyFinancesPrototype
            data={data}
            seminarDetailHref={financeDetailHref}
            variant={variante as FinancesVariantId}
          />
        ) : null}
        {pantalla === "resumen-seminario" ? (
          <PortalSeminarFinanceDetailPrototype
            availableBalanceAmount={data.availableBalanceAmount}
            seminar={target}
          />
        ) : null}

        {/* Rule 5 of the prototype skill: the state behind what is on screen. */}
        <Card size="sm">
          <CardHeader>
            <CardTitle>Estado del prototipo</CardTitle>
            <CardDescription>
              {screens[pantalla].label} · {variante} —{" "}
              {
                (screens[pantalla].variants as { [id: string]: string })[
                  variante
                ]
              }{" "}
              · caso {caso} · hoy {prototypeToday}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            <p className="tabular-nums">
              Seminario {target.instructorName} (
              {formatSeminarKindLabel(target.kind)}, seña{" "}
              {target.requiredDepositPercentage}%): cupo {target.quota} · con la
              seña cubierta {target.coveredCount} (todas las academias) ·
              lugares libres {target.quota - target.coveredCount} ·{" "}
              {target.hasStarted ? "comenzó" : "no comenzó"}
            </p>
            <ul className="flex flex-col gap-1 font-mono text-muted-foreground">
              {target.inscriptions.map((row) => (
                <li key={row.id}>
                  {row.person.fullName}: {row.allocatedAmount} asignados ·
                  precio {row.price?.name ?? "sin precio"} ·{" "}
                  {row.person.participating
                    ? "participa hoy"
                    : "no participa hoy"}{" "}
                  ·{" "}
                  {row.withdrawn
                    ? "Retirada"
                    : formatInscriptionFinancialStatus(row.financialStatus)}
                  {row.covered ? " · tiene lugar" : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <SwitcherBar
        go={go}
        selection={{ pantalla, variante, caso }}
        variantIds={variantIds}
      />
    </PortalShell>
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
