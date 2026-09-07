import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
} from "@/components/shared/data-table.shared";
import {
  getActiveFacetedFilterValues,
  setFacetedFilterValue,
} from "@/components/shared/data-table-helpers";
import { cn } from "@/lib/shared/utils";

/** What a table hands over for the panel to draw and to write back to. */
export type FiltersPanelContent = {
  groups: DataTableFacetedFilter[];
  onChange: (values: DataTableFacetedFilterValue) => void;
  selectedValues: DataTableFacetedFilterValue;
};

/**
 * What a table can ask of the panel. Kept apart from which panel is open, and
 * built out of callbacks that never change identity, because a table registers
 * its filters through an effect: were these to be rebuilt whenever the open
 * table changed, that effect would tear down and re-register on every open and
 * close the panel in the same breath it was asked to open it.
 */
type FiltersPanelActions = {
  close: () => void;
  publish: (ownerId: string, content: FiltersPanelContent) => void;
  toggle: (ownerId: string) => void;
  unpublish: (ownerId: string) => void;
};

const FiltersPanelActionsContext = createContext<FiltersPanelActions | null>(
  null,
);

/**
 * The shell's half of the filters panel. It holds what the tables on the page
 * publish and which one of them —if any— is showing, so the panel itself can
 * live at the edge of the layout while its trigger stays in the table's toolbar
 * where the reader looks for it.
 *
 * Keyed by owner because a page may carry more than one table: a trigger opens
 * its own filters and never a neighbour's.
 */
export function FiltersPanelProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, FiltersPanelContent>>(
    {},
  );
  const [openOwnerId, setOpenOwnerId] = useState<string | null>(null);

  const publish = useCallback(
    (ownerId: string, content: FiltersPanelContent) => {
      setEntries((currentEntries) => ({
        ...currentEntries,
        [ownerId]: content,
      }));
    },
    [],
  );

  const unpublish = useCallback((ownerId: string) => {
    setEntries((currentEntries) => {
      const nextEntries = { ...currentEntries };
      delete nextEntries[ownerId];

      return nextEntries;
    });
    setOpenOwnerId((currentOwnerId) =>
      currentOwnerId === ownerId ? null : currentOwnerId,
    );
  }, []);

  const toggle = useCallback((ownerId: string) => {
    setOpenOwnerId((currentOwnerId) =>
      currentOwnerId === ownerId ? null : ownerId,
    );
  }, []);

  const close = useCallback(() => setOpenOwnerId(null), []);

  const actions = useMemo(
    () => ({ close, publish, toggle, unpublish }),
    [close, publish, toggle, unpublish],
  );

  const state = useMemo(
    () => ({
      content: openOwnerId ? (entries[openOwnerId] ?? null) : null,
      openOwnerId,
    }),
    [entries, openOwnerId],
  );

  return (
    <FiltersPanelActionsContext.Provider value={actions}>
      <FiltersPanelStateContext.Provider value={state}>
        {children}
      </FiltersPanelStateContext.Provider>
    </FiltersPanelActionsContext.Provider>
  );
}

/** Which table's filters are showing, and what they are. */
type FiltersPanelState = {
  content: FiltersPanelContent | null;
  openOwnerId: string | null;
};

const FiltersPanelStateContext = createContext<FiltersPanelState>({
  content: null,
  openOwnerId: null,
});

/**
 * The panel, as a sibling of the content rather than a layer over it. It is a
 * flex child of the shell, so opening it narrows the page the way the navigation
 * sidebar does instead of covering what the reader is filtering.
 *
 * Below `md` there is no room to give away, so it stops taking part in the flow
 * and sits over the right edge — still with no overlay and nothing dimmed.
 */
export function FiltersPanelRegion() {
  const panel = useContext(FiltersPanelActionsContext);
  const { content } = useContext(FiltersPanelStateContext);
  const isOpen = content !== null;

  useEffect(() => {
    if (!isOpen || !panel) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        panel.close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, panel]);

  return (
    <aside
      aria-hidden={!isOpen}
      data-slot="filters-panel"
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "shrink-0 overflow-hidden text-sidebar-foreground transition-[width] duration-200 ease-linear md:sticky md:top-0 md:h-svh md:p-2 md:pl-0",
        isOpen
          ? "max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-(--sidebar-width) max-md:bg-sidebar max-md:p-2 md:w-[calc(var(--sidebar-width)+--spacing(2))]"
          : "w-0",
      )}
    >
      {content ? (
        <div className="flex h-full w-full flex-col md:w-(--sidebar-width)">
          <FiltersPanelBody
            content={content}
            onClose={() => panel?.close()}
            autoFocusClose
          />
        </div>
      ) : null}
    </aside>
  );
}

/**
 * Everything inside the panel, wherever the panel ends up. Every change applies
 * at once, so there is no `Aplicar`: the list re-filters behind the panel while
 * it is open and the reader watches it happen.
 */
export function FiltersPanelBody({
  autoFocusClose,
  content,
  onClose,
}: {
  autoFocusClose?: boolean;
  content: FiltersPanelContent;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { groups, onChange, selectedValues } = content;
  const hasSelectedValues =
    getActiveFacetedFilterValues(selectedValues).length > 0;

  useEffect(() => {
    if (autoFocusClose) {
      closeButtonRef.current?.focus();
    }
  }, [autoFocusClose]);

  return (
    <section aria-labelledby={titleId} className="flex h-full flex-col">
      <SidebarHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-0.5 px-2 py-1">
          <p id={titleId} className="font-heading text-base font-medium">
            Filtros
          </p>
          <p className="text-sm text-muted-foreground">
            Elegí cómo querés acotar la lista.
          </p>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X data-icon />
          <span className="sr-only">Cerrar filtros</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <FiltersPanelGroupField
            key={group.id}
            group={group}
            selectedValue={selectedValues[group.id] ?? ""}
            onChange={(nextValue) => {
              onChange(
                setFacetedFilterValue(selectedValues, group.id, nextValue),
              );
            }}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="items-center">
        <Button
          type="button"
          className="w-fit"
          disabled={!hasSelectedValues}
          onClick={() => onChange({})}
        >
          Limpiar filtros
        </Button>
      </SidebarFooter>
    </section>
  );
}

/**
 * One group of the panel: its name and a picker holding its options. A picker
 * rather than a list of radios because a group's options are a category's worth
 * —a dozen and a half of them on the choreographies list— and stacking them all
 * turns the panel into a scrolling wall where the next group cannot be seen.
 *
 * The way back out is a per-group `Limpiar` rather than a `Todos` option,
 * because a group is free to offer an option of its own by that name —the
 * professors list does— and a synthetic one would either duplicate it or take
 * its value away.
 */
function FiltersPanelGroupField({
  group,
  onChange,
  selectedValue,
}: {
  group: DataTableFacetedFilter;
  onChange: (value: string) => void;
  selectedValue: string;
}) {
  const selectId = useId();
  const hasSelectedValue = selectedValue.length > 0;

  return (
    <SidebarGroup className="gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <SidebarGroupLabel asChild>
          <Label htmlFor={selectId}>{group.label}</Label>
        </SidebarGroupLabel>
        {hasSelectedValue ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => onChange("")}
          >
            Limpiar
          </Button>
        ) : null}
      </div>
      <Select value={selectedValue} onValueChange={onChange}>
        {/*
         * The panel's surface is the sidebar's, and the trigger is transparent
         * by default: left alone it takes that grey and reads as disabled. The
         * field is on a surface the component was not drawn against, so it says
         * which one it sits on.
         */}
        <SelectTrigger id={selectId} className="w-full bg-background">
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
    </SidebarGroup>
  );
}

/**
 * A table's end of the arrangement: it keeps the shell's panel fed with what it
 * would draw, and says whether its own filters are the ones showing.
 *
 * Republishing is guarded by the shape of what is published rather than by
 * identity, because a view is free to build its groups inline on every render;
 * comparing identities there would loop.
 */
export function useFiltersPanelOwner({
  groups,
  onChange,
  selectedValues,
}: FiltersPanelContent) {
  const panel = useContext(FiltersPanelActionsContext);
  const { openOwnerId } = useContext(FiltersPanelStateContext);
  const ownerId = useId();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const contentKey = JSON.stringify({ groups, selectedValues });

  useEffect(() => {
    if (!panel) {
      return;
    }

    const { groups: publishedGroups, selectedValues: publishedValues } =
      JSON.parse(contentKey) as Omit<FiltersPanelContent, "onChange">;

    panel.publish(ownerId, {
      groups: publishedGroups,
      selectedValues: publishedValues,
      onChange: (values) => onChangeRef.current(values),
    });
  }, [contentKey, ownerId, panel]);

  useEffect(() => {
    if (!panel) {
      return;
    }

    return () => panel.unpublish(ownerId);
  }, [ownerId, panel]);

  return {
    hasRegion: panel !== null,
    isOpen: openOwnerId === ownerId,
    close: () => panel?.close(),
    toggle: () => panel?.toggle(ownerId),
  };
}
