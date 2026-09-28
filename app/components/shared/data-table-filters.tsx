import {
  ChevronLeft,
  ChevronRight,
  ListFilterPlus,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
} from "@/components/shared/data-table.shared";
import { setFacetedFilterValue } from "@/components/shared/data-table-helpers";

type DataTableFiltersProps = {
  groups: DataTableFacetedFilter[];
  selectedValues: DataTableFacetedFilterValue;
  onChange: (values: DataTableFacetedFilterValue) => void;
};

/**
 * The toolbar's filters: every applied group as a button group, then the
 * button that adds another.
 */
export function DataTableFilters({
  groups,
  selectedValues,
  onChange,
}: DataTableFiltersProps) {
  const applied = groups.filter((group) => selectedValues[group.id]);
  const available = groups.filter((group) => !selectedValues[group.id]);

  return (
    <>
      {applied.map((group) => (
        <AppliedFilter
          key={group.id}
          group={group}
          value={selectedValues[group.id]}
          onPick={(nextValue) =>
            onChange({ ...selectedValues, [group.id]: nextValue })
          }
          onRemove={() =>
            onChange(setFacetedFilterValue(selectedValues, group.id, ""))
          }
        />
      ))}
      <AddFilter
        groups={available}
        onPick={(groupId, value) =>
          onChange({ ...selectedValues, [groupId]: value })
        }
      />
    </>
  );
}

function AppliedFilter({
  group,
  value,
  onPick,
  onRemove,
}: {
  group: DataTableFacetedFilter;
  value: string;
  onPick: (value: string) => void;
  onRemove: () => void;
}) {
  const option = group.options.find(
    (candidate) => candidate.value === value,
  ) ?? { label: value, value };
  const Icon = group.icon;

  return (
    <ButtonGroup
      data-filter-group={group.id}
      aria-label={`${group.label}: ${option.label}`}
    >
      <ButtonGroupText className="font-normal text-muted-foreground">
        {Icon ? <Icon /> : null}
        {group.label}
      </ButtonGroupText>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            {group.renderValue ? group.renderValue(option) : option.label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
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
        onClick={onRemove}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </ButtonGroup>
  );
}

/**
 * The picker that applies one more filter: a group, then one of its values.
 * It is offered only while some group is still unapplied.
 */
function AddFilter({
  groups,
  onPick,
}: {
  groups: DataTableFacetedFilter[];
  onPick: (groupId: string, value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const group = groups.find((candidate) => candidate.id === groupId);

  if (groups.length === 0) {
    return null;
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setGroupId(null);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <AddFilterTooltip isPickerOpen={isOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Agregar filtro"
          >
            <ListFilterPlus />
          </Button>
        </PopoverTrigger>
      </AddFilterTooltip>
      <PopoverContent align="start" className="w-64 p-1">
        {group ? (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => setGroupId(null)}
            >
              <ChevronLeft data-icon="inline-start" />
              {group.label}
            </Button>
            <FilterOptionList
              group={group}
              onPick={(value) => {
                onPick(group.id, value);
                handleOpenChange(false);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Filtrar por
            </p>
            {groups.map((candidate) => (
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

/** Past this many values, a group's list gets a search box. */
const searchableOptionCount = 7;

function FilterOptionList({
  group,
  onPick,
}: {
  group: DataTableFacetedFilter;
  onPick: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("es");
  const options = group.options.filter((option) =>
    option.label.toLocaleLowerCase("es").includes(needle),
  );

  return (
    <>
      {group.options.length > searchableOptionCount ? (
        <Input
          autoFocus
          aria-label={`Buscar ${group.label.toLocaleLowerCase("es")}`}
          placeholder={`Buscar ${group.label.toLocaleLowerCase("es")}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="flex max-h-72 flex-col overflow-y-auto">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </Button>
        ))}
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Sin resultados.
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * "Agregar filtro" as a tooltip. Closing the picker hands focus back to its
 * button, and a tooltip opens on focus, so after every pick it would pop up and
 * stay. It is held shut from the moment the picker opens until the pointer next
 * enters the button.
 */
function AddFilterTooltip({
  isPickerOpen,
  children,
}: {
  isPickerOpen: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHeldShut, setIsHeldShut] = useState(false);

  if (isPickerOpen && !isHeldShut) {
    setIsHeldShut(true);
  }

  return (
    <TooltipProvider>
      <Tooltip
        open={isOpen && !isPickerOpen}
        onOpenChange={(open) => {
          if (open && isHeldShut) {
            return;
          }
          setIsOpen(open);
        }}
      >
        <TooltipTrigger
          asChild
          onPointerEnter={() => {
            if (!isPickerOpen) {
              setIsHeldShut(false);
            }
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>Agregar filtro</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
