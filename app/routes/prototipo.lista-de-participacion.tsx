// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/912-participation-list`. Run `pnpm dev` and open
// `/prototipo/lista-de-participacion` to see the admin participation list for
// wayfinder ticket #912 (map #907). No loader, no auth, no database: in-memory
// fixtures, every write a stub, and the real admin shell around the list.
//
// The bar at the bottom switches everything, and the arrow keys cycle the
// variant. The search parameters it writes:
//   `variante`: `A`, `B`, `C`
//   `caso`: `ordenado`, `mixto`, `sin-ordenar`, `faltan-datos`,
//     `sin-elegibles`, `sin-evento`
//   `conflicto`: `si` makes the next move fail its stale check
// The table's own `busqueda`, `orden`, `pagina` and `advertencias` stay as the
// shared table writes them; `cronograma` is variant C's tab.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import {
  participationVariants,
  ParticipationListPrototype,
  type ParticipationVariant,
} from "@/features/admin/presentations/prototype/participation-list.prototype";
import {
  prototypeCaseIds,
  prototypeCaseLabels,
  type PrototypeCaseId,
} from "@/features/admin/presentations/prototype/participation-fixtures.prototype";

export const meta = () => [
  { title: "Prototipo · Lista de participación | En Escena" },
];

const variantIds = Object.keys(participationVariants) as ParticipationVariant[];

function readOption<TOption extends string>(
  value: string | null,
  options: readonly TOption[],
): TOption {
  return options.includes(value as TOption)
    ? (value as TOption)
    : (options[0] as TOption);
}

export default function ParticipationListPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = readOption(searchParams.get("variante"), variantIds);
  const caseId = readOption(searchParams.get("caso"), prototypeCaseIds);
  const conflict = searchParams.get("conflicto") === "si";
  const [sortColumnId, sortDirection] = (searchParams.get("orden") ?? "").split(
    ":",
  );
  const sort =
    sortColumnId && (sortDirection === "asc" || sortDirection === "desc")
      ? { columnId: sortColumnId, direction: sortDirection as "asc" | "desc" }
      : null;

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(next)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      setSearchParams(params, { preventScrollReset: true, replace: true });
    },
    [searchParams, setSearchParams],
  );

  const cycle = useCallback(
    (offset: number) => {
      const index = variantIds.indexOf(variant);
      setParams({
        variante:
          variantIds[
            (index + offset + variantIds.length) % variantIds.length
          ] ?? "A",
      });
    },
    [setParams, variant],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (
        target?.closest(
          "input, textarea, [contenteditable], [role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu'], [role='tablist'], [aria-roledescription='sortable']",
        )
      ) {
        return;
      }

      cycle(event.key === "ArrowRight" ? 1 : -1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycle]);

  return (
    <AdminShell
      email="admin@prototipo.test"
      events={[
        { id: "evento-prototipo", name: "En Escena 2026", active: true },
      ]}
      selectedEventId={caseId === "sin-evento" ? null : "evento-prototipo"}
      breadcrumbItems={
        variant === "A"
          ? [
              { label: "Coreografías", to: "/administracion/coreografias" },
              { label: "Participación" },
            ]
          : [{ label: "Lista de participación" }]
      }
    >
      <div className="pb-48">
        <ParticipationListPrototype
          key={caseId}
          caseId={caseId}
          conflict={conflict}
          variant={variant}
          query={{
            onlyWarnings: (searchParams.get("advertencias") ?? "")
              .split(",")
              .includes("con"),
            page: Math.max(1, Number(searchParams.get("pagina") ?? 1) || 1),
            scheduleTab: searchParams.get("cronograma") ?? "todos",
            search: searchParams.get("busqueda") ?? "",
            sort,
          }}
          onToggleOnlyWarnings={() =>
            setParams({
              advertencias: searchParams.get("advertencias") ? null : "con",
            })
          }
          setScheduleTab={(tab) =>
            setParams({
              cronograma: tab === "todos" ? null : tab,
              pagina: null,
            })
          }
        />
      </div>

      {import.meta.env.PROD ? null : (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-4xl flex-col gap-2 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
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
              <span className="min-w-96 text-center font-medium">
                {variant} — {participationVariants[variant]}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-muted-foreground">Caso</span>
              {prototypeCaseIds.map((id: PrototypeCaseId) => (
                <Button
                  key={id}
                  type="button"
                  size="xs"
                  variant={id === caseId ? "default" : "outline"}
                  onClick={() => setParams({ caso: id, pagina: null })}
                >
                  {prototypeCaseLabels[id]}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-muted-foreground">Mover</span>
              <Button
                type="button"
                size="xs"
                variant={conflict ? "default" : "outline"}
                onClick={() => setParams({ conflicto: conflict ? null : "si" })}
              >
                {conflict
                  ? "El próximo movimiento choca con otro admin"
                  : "Simular movimiento concurrente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
