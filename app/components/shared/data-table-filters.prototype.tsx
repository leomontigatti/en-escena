/**
 * PROTOTYPE — throwaway, never merge. Lives on `prototype/table-filters-toolbar`.
 *
 * Question: what should replace the filters side panel? Three toolbar layouts,
 * switchable with `?variant=` on any list with filters (the admin choreographies list has
 * the most groups): `panel` is today's panel, kept for comparison; `A` one
 * button per group; `B` an always-visible row of selects; `C` an "Agregar
 * filtro" menu with the active filters as chips.
 */
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
} from "@/components/shared/data-table.shared";
import { setFacetedFilterValue } from "@/components/shared/data-table-helpers";

const VARIANTS = [
  { key: "panel", name: "Panel actual" },
  { key: "A", name: "Botón por grupo" },
  { key: "B", name: "Fila de selects" },
  { key: "C", name: "Agregar filtro + chips" },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

export function usePrototypeFilterVariant(): VariantKey {
  const [searchParams] = useSearchParams();
  const value = searchParams.get("variant");
  return VARIANTS.find((variant) => variant.key === value)?.key ?? "panel";
}

type ToolbarProps = {
  search: ReactNode;
  groups: DataTableFacetedFilter[];
  selectedValues: DataTableFacetedFilterValue;
  onChange: (values: DataTableFacetedFilterValue) => void;
};

function optionLabel(group: DataTableFacetedFilter, value: string | undefined) {
  return group.options.find((option) => option.value === value)?.label;
}

function ClearAll({
  selectedValues,
  onChange,
}: Pick<ToolbarProps, "selectedValues" | "onChange">) {
  if (Object.keys(selectedValues).length === 0) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onChange({})}
    >
      Limpiar filtros
      <X data-icon="inline-end" />
    </Button>
  );
}

/** A searchable option list, shared by A and C. */
function OptionList({
  group,
  selected,
  onPick,
}: {
  group: DataTableFacetedFilter;
  selected: string | undefined;
  onPick: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = group.options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="flex flex-col gap-1">
      {group.options.length > 7 ? (
        <Input
          autoFocus
          placeholder={`Buscar ${group.label.toLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="flex max-h-72 flex-col overflow-y-auto">
        {shown.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={option.value === selected ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </Button>
        ))}
        {shown.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Sin resultados
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A: every group is a button beside the search; its value shows on it. */
function GroupButton({
  group,
  selectedValues,
  onChange,
}: { group: DataTableFacetedFilter } & Pick<
  ToolbarProps,
  "selectedValues" | "onChange"
>) {
  const [open, setOpen] = useState(false);
  const selected = selectedValues[group.id];
  const label = optionLabel(group, selected);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={label ? "secondary" : "outline"}
          size="sm"
          className="max-w-64"
        >
          {label ? (
            <span className="truncate">
              <span className="text-muted-foreground">{group.label}:</span>{" "}
              {label}
            </span>
          ) : (
            group.label
          )}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <OptionList
          group={group}
          selected={selected}
          onPick={(value) => {
            onChange(setFacetedFilterValue(selectedValues, group.id, value));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function VariantA({ search, groups, selectedValues, onChange }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-80">{search}</div>
      {groups.map((group) => (
        <GroupButton
          key={group.id}
          group={group}
          selectedValues={selectedValues}
          onChange={onChange}
        />
      ))}
      <ClearAll selectedValues={selectedValues} onChange={onChange} />
    </div>
  );
}

/** B: the search on its own line, then every group as an open select. */
function VariantB({ search, groups, selectedValues, onChange }: ToolbarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="sm:max-w-md">{search}</div>
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group) => {
          const selected = selectedValues[group.id] ?? "";
          return (
            <Select
              key={group.id}
              value={selected}
              onValueChange={(value) =>
                onChange(setFacetedFilterValue(selectedValues, group.id, value))
              }
            >
              <SelectTrigger
                size="sm"
                className={cn("min-w-36", selected && "bg-secondary")}
              >
                <span className="text-muted-foreground">{group.label}:</span>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}
        <ClearAll selectedValues={selectedValues} onChange={onChange} />
      </div>
    </div>
  );
}

/** C: one menu to add a filter; only the active ones take room, as chips. */
function VariantC({ search, groups, selectedValues, onChange }: ToolbarProps) {
  const active = groups.filter((group) => selectedValues[group.id]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-80">{search}</div>
      {active.map((group) => (
        <div
          key={group.id}
          className="flex h-8 items-center gap-1 rounded-lg border bg-secondary pr-1 pl-2.5 text-sm"
        >
          <span className="text-muted-foreground">{group.label}:</span>
          {optionLabel(group, selectedValues[group.id])}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Quitar ${group.label}`}
            onClick={() =>
              onChange(setFacetedFilterValue(selectedValues, group.id, ""))
            }
          >
            <X />
          </Button>
        </div>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus data-icon="inline-start" />
            Agregar filtro
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {groups.map((group) => (
            <DropdownMenuSub key={group.id}>
              <DropdownMenuSubTrigger>{group.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                {group.options.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() =>
                      onChange({ ...selectedValues, [group.id]: option.value })
                    }
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ClearAll selectedValues={selectedValues} onChange={onChange} />
    </div>
  );
}

export function PrototypeFiltersToolbar({
  variant,
  ...props
}: ToolbarProps & { variant: Exclude<VariantKey, "panel"> }) {
  if (variant === "A") return <VariantA {...props} />;
  if (variant === "B") return <VariantB {...props} />;
  return <VariantC {...props} />;
}

/** The floating bar that flips between variants. Dev only. */
export function PrototypeVariantSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = usePrototypeFilterVariant();
  const index = VARIANTS.findIndex((variant) => variant.key === current);

  const go = (step: number) => {
    const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, [contenteditable], [role=listbox], [role=menu]",
        )
      )
        return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-sm text-background shadow-lg">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Anterior"
        onClick={() => go(-1)}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-48 text-center">
        {VARIANTS[index].key} · {VARIANTS[index].name}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Siguiente"
        onClick={() => go(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
