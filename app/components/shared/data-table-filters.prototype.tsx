/**
 * PROTOTYPE — throwaway, never merge. Lives on `prototype/table-filters-toolbar`.
 *
 * Question: what should replace the filters side panel? Four toolbar layouts,
 * switchable with `?variant=` on any list with filters (the admin choreographies list has
 * the most groups): `panel` is today's panel, kept for comparison; `A` one
 * button per group; `B` an always-visible row of selects; `C` an "Agregar
 * filtro" picker with the active filters as chips; `D` one box, search and
 * chips together: typing only fills it, Enter searches or applies the
 * highlighted filter value.
 */
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PopoverAnchor = PopoverPrimitive.Anchor;
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
  { key: "D", name: "Una caja, estilo Odoo" },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

export function usePrototypeFilterVariant(): VariantKey {
  const [searchParams] = useSearchParams();
  const value = searchParams.get("variant");
  return VARIANTS.find((variant) => variant.key === value)?.key ?? "panel";
}

type SearchProps = {
  query: string;
  placeholder: string;
  onChange: (value: string) => void;
  onClear?: () => void;
};

type ToolbarProps = {
  search: ReactNode;
  searchProps: SearchProps | null;
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

/** A chip for an active filter: its body reopens the value picker, the ✕ removes it. */
function FilterChip({
  group,
  selectedValues,
  onChange,
}: { group: DataTableFacetedFilter } & Pick<
  ToolbarProps,
  "selectedValues" | "onChange"
>) {
  const [open, setOpen] = useState(false);
  const selected = selectedValues[group.id];
  return (
    <div className="flex h-7 shrink-0 items-center overflow-hidden rounded-md border bg-secondary text-sm">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-full pr-1 pl-2 font-normal"
          >
            <span className="text-muted-foreground">{group.label}:</span>
            <span className="font-medium">{optionLabel(group, selected)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <OptionList
            group={group}
            selected={selected}
            onPick={(value) => {
              onChange({ ...selectedValues, [group.id]: value });
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
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
  );
}

/** "Agregar filtro": one popover, the group first, then its values. */
function AddFilterButton({
  groups,
  selectedValues,
  onChange,
  compact = false,
}: Pick<ToolbarProps, "groups" | "selectedValues" | "onChange"> & {
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const available = groups.filter((group) => !selectedValues[group.id]);
  const group = groups.find((candidate) => candidate.id === groupId);
  if (available.length === 0) return null;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setGroupId(null);
      }}
    >
      <PopoverTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Agregar filtro"
          >
            <ListFilter />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">
            <Plus data-icon="inline-start" />
            Agregar filtro
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        {group ? (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-muted-foreground"
              onClick={() => setGroupId(null)}
            >
              <ChevronLeft data-icon="inline-start" />
              {group.label}
            </Button>
            <OptionList
              group={group}
              selected={undefined}
              onPick={(value) => {
                onChange({ ...selectedValues, [group.id]: value });
                setOpen(false);
                setGroupId(null);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Filtrar por
            </p>
            {available.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-between"
                onClick={() => setGroupId(candidate.id)}
              >
                {candidate.label}
                <ChevronRight data-icon="inline-end" />
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** C: search beside an "Agregar filtro" button; active filters as chips. */
function VariantC({ search, groups, selectedValues, onChange }: ToolbarProps) {
  const active = groups.filter((group) => selectedValues[group.id]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-80">{search}</div>
      {active.map((group) => (
        <FilterChip
          key={group.id}
          group={group}
          selectedValues={selectedValues}
          onChange={onChange}
        />
      ))}
      <AddFilterButton
        groups={groups}
        selectedValues={selectedValues}
        onChange={onChange}
      />
      <ClearAll selectedValues={selectedValues} onChange={onChange} />
    </div>
  );
}

type Suggestion =
  | { kind: "search"; key: string }
  | { kind: "group"; key: string; group: DataTableFacetedFilter }
  | {
      kind: "filter";
      key: string;
      group: DataTableFacetedFilter;
      value: string;
      label: string;
    };

/**
 * What the box's dropdown offers. With nothing typed it lists the groups, and
 * a group once opened lists its values; with text it offers to search for it
 * and the filter values the text matches.
 */
function buildSuggestions(
  text: string,
  openGroup: DataTableFacetedFilter | undefined,
  groups: DataTableFacetedFilter[],
  selectedValues: DataTableFacetedFilterValue,
): Suggestion[] {
  const needle = text.trim().toLowerCase();
  const toFilter = (group: DataTableFacetedFilter) =>
    group.options
      .filter(
        (option) =>
          option.label.toLowerCase().includes(needle) &&
          selectedValues[group.id] !== option.value,
      )
      .map((option) => ({
        kind: "filter" as const,
        key: `${group.id}:${option.value}`,
        group,
        value: option.value,
        label: option.label,
      }));

  if (openGroup) return toFilter(openGroup);
  if (needle.length === 0) {
    return groups.map((group) => ({
      kind: "group" as const,
      key: group.id,
      group,
    }));
  }
  return [
    { kind: "search", key: "search" },
    ...groups.flatMap(toFilter).slice(0, 8),
  ];
}

function SuggestionLabel({
  suggestion,
  text,
}: {
  suggestion: Suggestion;
  text: string;
}) {
  if (suggestion.kind === "search") {
    return (
      <>
        <Search data-icon="inline-start" />
        Buscar <span className="font-medium">«{text.trim()}»</span>
        <span className="text-muted-foreground">
          en número, nombre o academia
        </span>
      </>
    );
  }
  if (suggestion.kind === "group") {
    return (
      <>
        <span className="flex-1 text-left">{suggestion.group.label}</span>
        <ChevronRight data-icon="inline-end" />
      </>
    );
  }
  return (
    <>
      <span className="text-muted-foreground">{suggestion.group.label}:</span>
      <span className="font-medium">{suggestion.label}</span>
    </>
  );
}

/** The committed search, drawn as a chip like the filters beside it. */
function SearchChip({
  query,
  onRemove,
}: {
  query: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-1 overflow-hidden rounded-md border bg-secondary pl-2 text-xs">
      <span className="text-muted-foreground">Búsqueda:</span>
      <span className="font-medium">{query}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Quitar búsqueda"
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}

/**
 * D: one box, Odoo style. Everything applied is a chip inside it; typing only
 * fills the box, and Enter either searches for the text or applies the filter
 * value highlighted in the dropdown.
 */
function VariantD({
  searchProps,
  groups,
  selectedValues,
  onChange,
}: ToolbarProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = searchProps?.query.trim() ?? "";
  const clearSearch = () =>
    (searchProps?.onClear ?? (() => searchProps?.onChange("")))();
  const active = groups.filter((group) => selectedValues[group.id]);
  const openGroup = groups.find((group) => group.id === openGroupId);
  const suggestions = buildSuggestions(text, openGroup, groups, selectedValues);

  const pick = (suggestion: Suggestion) => {
    if (suggestion.kind === "group") {
      setOpenGroupId(suggestion.group.id);
      setHighlight(0);
      return;
    }
    if (suggestion.kind === "search") {
      searchProps?.onChange(text.trim());
    } else {
      onChange({ ...selectedValues, [suggestion.group.id]: suggestion.value });
    }
    setText("");
    setOpenGroupId(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const suggestion = suggestions[highlight];
      if (suggestion) pick(suggestion);
    } else if (event.key === "Escape") {
      setOpen(false);
      setOpenGroupId(null);
    } else if (event.key === "Backspace" && text === "") {
      if (openGroupId) {
        setOpenGroupId(null);
      } else if (active.length > 0) {
        const last = active[active.length - 1];
        onChange(setFacetedFilterValue(selectedValues, last.id, ""));
      } else if (query) {
        clearSearch();
      }
    }
  };

  return (
    <Popover
      open={open && suggestions.length > 0}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setOpenGroupId(null);
      }}
    >
      <PopoverAnchor asChild>
        <div
          className="flex min-h-9 w-fit max-w-full min-w-md flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent py-1 pr-1 pl-2.5 transition-shadow focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/40"
          onClick={() => inputRef.current?.focus()}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          {query ? <SearchChip query={query} onRemove={clearSearch} /> : null}
          {active.map((group) => (
            <FilterChip
              key={group.id}
              group={group}
              selectedValues={selectedValues}
              onChange={onChange}
            />
          ))}
          {openGroup ? (
            <span className="text-sm text-muted-foreground">
              {openGroup.label}:
            </span>
          ) : null}
          {/* oxlint-disable-next-line ui/no-raw-form-element -- PROTOTYPE: a bare input inside the chip box */}
          <input
            ref={inputRef}
            className="h-7 min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar o filtrar…"
            value={text}
            aria-label="Buscar o filtrar"
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {text || query || active.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Limpiar búsqueda y filtros"
              onClick={(event) => {
                event.stopPropagation();
                setText("");
                clearSearch();
                onChange({});
              }}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="flex max-h-80 w-(--radix-popover-trigger-width) flex-col overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const box = inputRef.current?.parentElement;
          if (event.target instanceof Node && box?.contains(event.target)) {
            event.preventDefault();
          }
        }}
      >
        {!openGroup && text.trim() === "" ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Filtrar por
          </p>
        ) : null}
        {suggestions.map((suggestion, index) => (
          <Button
            key={suggestion.key}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start font-normal",
              index === highlight && "bg-muted",
            )}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => pick(suggestion)}
          >
            <SuggestionLabel suggestion={suggestion} text={text} />
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function PrototypeFiltersToolbar({
  variant,
  ...props
}: ToolbarProps & { variant: Exclude<VariantKey, "panel"> }) {
  if (variant === "A") return <VariantA {...props} />;
  if (variant === "B") return <VariantB {...props} />;
  if (variant === "C") return <VariantC {...props} />;
  return <VariantD {...props} />;
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
