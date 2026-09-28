/**
 * PROTOTYPE — throwaway, never merge. Lives on `prototype/table-filters-toolbar`.
 *
 * Question: what should replace the filters side panel? One box that holds the
 * search and the filters as chips (the Odoo shape the user picked), switchable
 * with `?variant=` on any list with filters: `panel` is today's panel; `C` the
 * search beside an "Agregar filtro" picker with the filters as chips; `D` the
 * box hand-rolled on a popover; `E` the same box on the app's `Combobox`.
 * Typing only fills the box; Enter searches or applies the highlighted value.
 */
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  ListFilterPlus,
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
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

const PopoverAnchor = PopoverPrimitive.Anchor;
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
} from "@/components/shared/data-table.shared";
import { setFacetedFilterValue } from "@/components/shared/data-table-helpers";

const VARIANTS = [
  { key: "panel", name: "Panel actual" },
  { key: "C", name: "Grupos de botones" },
  { key: "D", name: "Una caja, a mano" },
  { key: "E", name: "Una caja, sobre Combobox" },
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Agregar filtro"
            title="Agregar filtro"
          >
            <ListFilterPlus />
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
/**
 * An applied filter as a button group: the field as plain text, the value as
 * a button that opens a single-choice menu, and a button that removes it.
 */
function FilterButtonGroup({
  group,
  selectedValues,
  onChange,
}: { group: DataTableFacetedFilter } & Pick<
  ToolbarProps,
  "selectedValues" | "onChange"
>) {
  const selected = selectedValues[group.id];
  return (
    <ButtonGroup>
      <ButtonGroupText className="font-normal text-muted-foreground">
        {group.label}
      </ButtonGroupText>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            {optionLabel(group, selected)}
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuRadioGroup
            value={selected}
            onValueChange={(value) =>
              onChange({ ...selectedValues, [group.id]: value })
            }
          >
            {group.options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Quitar filtro ${group.label}`}
        onClick={() =>
          onChange(setFacetedFilterValue(selectedValues, group.id, ""))
        }
      >
        <X />
      </Button>
    </ButtonGroup>
  );
}

/** C: search, then each applied filter as a button group, then "add". */
function VariantC({ search, groups, selectedValues, onChange }: ToolbarProps) {
  const active = groups.filter((group) => selectedValues[group.id]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-80">{search}</div>
      {active.map((group) => (
        <FilterButtonGroup
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

/**
 * E: D rebuilt on the app's `Combobox` (Base UI). The box is `ComboboxChips`,
 * each applied search or filter is a `ComboboxChip`, and the dropdown is a
 * `ComboboxList`, so keyboard, focus and ARIA come from the primitive. Items
 * and chips are string keys: `s:` searches the text, `g:<group>` opens a
 * group, `v:<group>:<value>` applies a value; a chip is `c:search` or
 * `c:<group>`.
 */
function VariantE({
  searchProps,
  groups,
  selectedValues,
  onChange,
}: ToolbarProps) {
  const anchorRef = useComboboxAnchor();
  const eInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const query = searchProps?.query.trim() ?? "";
  const clearSearch = () =>
    (searchProps?.onClear ?? (() => searchProps?.onChange("")))();
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const openGroup = openGroupId ? groupById.get(openGroupId) : undefined;
  const needle = text.trim().toLowerCase();

  const chips = [
    ...(query ? ["c:search"] : []),
    ...groups
      .filter((group) => selectedValues[group.id])
      .map((group) => `c:${group.id}`),
  ];

  const valueItems = (group: DataTableFacetedFilter) =>
    group.options
      .filter((option) => option.label.toLowerCase().includes(needle))
      .map((option) => `v:${group.id}:${option.value}`);
  const items = openGroup
    ? valueItems(openGroup)
    : needle.length === 0
      ? groups.map((group) => `g:${group.id}`)
      : ["s:", ...groups.flatMap(valueItems).slice(0, 8)];

  const parseValueItem = (key: string) => {
    const [, groupId, ...rest] = key.split(":");
    const group = groupById.get(groupId);
    const value = rest.join(":");
    return { group, value, label: group ? optionLabel(group, value) : value };
  };

  const labelOf = (key: string) => {
    if (key === "c:search") return `Búsqueda: ${query}`;
    if (key.startsWith("c:")) {
      const group = groupById.get(key.slice(2));
      return group
        ? `${group.label}: ${optionLabel(group, selectedValues[group.id])}`
        : key;
    }
    if (key.startsWith("g:")) return groupById.get(key.slice(2))?.label ?? key;
    if (key.startsWith("v:")) {
      const { group, label } = parseValueItem(key);
      return `${group?.label}: ${label}`;
    }
    return `Buscar «${text.trim()}»`;
  };

  const handleValueChange = (next: string[]) => {
    const added = next.find((key) => !chips.includes(key));
    const removed = chips.find((key) => !next.includes(key));
    if (removed) {
      if (removed === "c:search") clearSearch();
      else
        onChange(setFacetedFilterValue(selectedValues, removed.slice(2), ""));
      return;
    }
    if (!added) return;
    if (added.startsWith("g:")) {
      setOpenGroupId(added.slice(2));
      setText("");
      setOpen(true);
      return;
    }
    if (added === "s:") {
      searchProps?.onChange(text.trim());
    } else if (added.startsWith("v:")) {
      const { group, value } = parseValueItem(added);
      if (group) onChange({ ...selectedValues, [group.id]: value });
    }
    setText("");
    setOpenGroupId(null);
    setOpen(false);
  };

  return (
    <Combobox
      multiple
      items={items}
      filter={null}
      autoHighlight
      value={chips}
      onValueChange={handleValueChange}
      inputValue={text}
      onInputValueChange={(value, details) => {
        // Base UI empties the input after every pick; only typing is kept.
        if (
          details.reason === "input-change" ||
          details.reason === "input-clear"
        ) {
          setText(value);
        }
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setOpenGroupId(null);
      }}
      itemToStringLabel={labelOf}
    >
      <ComboboxChips ref={anchorRef} className="w-fit max-w-full min-w-md py-1">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <ComboboxValue>
          {chips.map((key) => (
            <ComboboxChip
              key={key}
              className="cursor-pointer"
              onClick={() => {
                if (key === "c:search") return;
                setOpenGroupId(key.slice(2));
                setOpen(true);
                eInputRef.current?.focus();
              }}
            >
              <span className="font-normal text-muted-foreground">
                {labelOf(key).split(": ")[0]}:
              </span>
              {labelOf(key).split(": ").slice(1).join(": ")}
            </ComboboxChip>
          ))}
        </ComboboxValue>
        {openGroup ? (
          <span className="text-muted-foreground">{openGroup.label}:</span>
        ) : null}
        <ComboboxChipsInput
          ref={eInputRef}
          placeholder="Buscar o filtrar…"
          className="min-w-40"
          onKeyDown={(event) => {
            // Backspace inside an opened group steps back out of it instead
            // of removing the last chip.
            if (event.key === "Backspace" && text === "" && openGroupId) {
              (
                event as unknown as { preventBaseUIHandler: () => void }
              ).preventBaseUIHandler();
              setOpenGroupId(null);
            }
          }}
        />
        {text || chips.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Limpiar búsqueda y filtros"
            onClick={() => {
              setText("");
              clearSearch();
              onChange({});
            }}
          >
            <X />
          </Button>
        ) : null}
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        {openGroup ? (
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
            {openGroup.label}
          </p>
        ) : needle.length === 0 ? (
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
            Filtrar por
          </p>
        ) : null}
        <ComboboxEmpty>Sin coincidencias.</ComboboxEmpty>
        <ComboboxList>
          {(key: string) => (
            <ComboboxItem key={key} value={key}>
              <EItemLabel
                itemKey={key}
                inGroup={Boolean(openGroup)}
                text={text}
                label={labelOf(key)}
                isCurrent={
                  key.startsWith("v:") &&
                  (() => {
                    const { group, value } = parseValueItem(key);
                    return group ? selectedValues[group.id] === value : false;
                  })()
                }
              />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function EItemLabel({
  itemKey,
  text,
  label,
  isCurrent,
  inGroup,
}: {
  inGroup: boolean;
  itemKey: string;
  text: string;
  label: string;
  isCurrent: boolean;
}) {
  if (itemKey === "s:") {
    return (
      <>
        <Search />
        Buscar <span className="font-medium">«{text.trim()}»</span>
        <span className="text-muted-foreground">
          en número, nombre o academia
        </span>
      </>
    );
  }
  if (itemKey.startsWith("g:")) {
    return (
      <>
        <span className="flex-1">{label}</span>
        <ChevronRight className="text-muted-foreground" />
      </>
    );
  }
  const [groupLabel, ...rest] = label.split(": ");
  return (
    <>
      {inGroup ? null : (
        <span className="text-muted-foreground">{groupLabel}:</span>
      )}
      <span className="font-medium">{rest.join(": ")}</span>
      {isCurrent ? <Check className="ml-auto" /> : null}
    </>
  );
}

export function PrototypeFiltersToolbar({
  variant,
  ...props
}: ToolbarProps & { variant: Exclude<VariantKey, "panel"> }) {
  if (variant === "C") return <VariantC {...props} />;
  if (variant === "E") return <VariantE {...props} />;
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
