// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/912-participation-list`. Run `pnpm dev` and open
// `/prototipo/lista-de-participacion` to see the admin presentation list for
// wayfinder ticket #912 (map #907). No loader, no auth, no database: in-memory
// fixtures, every write a stub, and the real admin shell around the list.
//
// The first review kept one variant (its own page, tabs by day). The bar at the
// bottom switches the case. The search parameters it writes:
//   `caso`: `ordenado`, `mixto`, `sin-ordenar`, `faltan-datos`,
//     `sin-elegibles`, `sin-evento`
//   `conflicto`: `si` makes the next move fail its stale check
// The table's own `busqueda`, `orden` and `pagina` stay as the shared table
// writes them; `advertencias` is the notices' filter (`con` or `bloqueantes`)
// and `dia` the tab.
import { useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { ParticipationListPrototype } from "@/features/admin/presentations/prototype/participation-list.prototype";
import {
  prototypeCaseIds,
  prototypeCaseLabels,
} from "@/features/admin/presentations/prototype/participation-fixtures.prototype";

export const meta = () => [{ title: "Prototipo · Presentación | En Escena" }];

const warningFilters = ["con", "bloqueantes"] as const;

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
  const caseId = readOption(searchParams.get("caso"), prototypeCaseIds);
  const conflict = searchParams.get("conflicto") === "si";
  const [sortColumnId, sortDirection] = (searchParams.get("orden") ?? "").split(
    ":",
  );
  const sort =
    sortColumnId === "orden" &&
    (sortDirection === "asc" || sortDirection === "desc")
      ? { columnId: sortColumnId, direction: sortDirection as "asc" | "desc" }
      : null;

  const setParams = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(next)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    setSearchParams(params, { preventScrollReset: true, replace: true });
  };

  return (
    <AdminShell
      email="admin@prototipo.test"
      events={[
        { id: "evento-prototipo", name: "En Escena 2026", active: true },
      ]}
      selectedEventId={caseId === "sin-evento" ? null : "evento-prototipo"}
      breadcrumbItems={[{ label: "Presentación" }]}
    >
      <div className="pb-40">
        <ParticipationListPrototype
          key={caseId}
          caseId={caseId}
          conflict={conflict}
          query={{
            day: searchParams.get("dia") ?? "todos",
            // No filter unless the param names one: `readOption` would fall
            // back to the first option.
            warningFilter:
              warningFilters.find(
                (filter) => filter === searchParams.get("advertencias"),
              ) ?? null,
            page: Math.max(1, Number(searchParams.get("pagina") ?? 1) || 1),
            search: searchParams.get("busqueda") ?? "",
            sort,
          }}
          onToggleWarningFilter={(filter) =>
            setParams({
              advertencias:
                searchParams.get("advertencias") === filter ? null : filter,
              pagina: null,
            })
          }
          setDay={(day) =>
            setParams({ dia: day === "todos" ? null : day, pagina: null })
          }
        />
      </div>

      {import.meta.env.PROD ? null : (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-4xl flex-col gap-2 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-muted-foreground">Caso</span>
              {prototypeCaseIds.map((id) => (
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
