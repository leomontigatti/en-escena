import { X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
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
  SIDEBAR_WIDTH,
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

/**
 * The shell's panel is the one panel of its page, so a trigger in a toolbar can
 * name it without being handed an id: `aria-controls` needs a name that is the
 * same on both ends, and there is only ever one end here.
 */
export const FILTERS_PANEL_REGION_ID = "filters-panel-region";

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
 * Escape closes the panel, but only when the key was pressed inside it.
 *
 * The listener is a native one on the panel's own element rather than on the
 * document, and that is the whole point: a group's `Select` draws its options in
 * a portal outside the panel, so the Escape that dismisses an open picker never
 * reaches here. A document listener would take that same Escape and shut the
 * panel behind the picker the reader meant to close.
 *
 * Native rather than React's `onKeyDown` for the same reason: React sends an
 * event up the tree it rendered, portal and all, which is exactly the walk this
 * listener has to miss.
 */
function useCloseOnEscape(
  isOpen: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const panelElement = panelRef.current;

    if (!isOpen || !panelElement) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    panelElement.addEventListener("keydown", handleKeyDown);

    return () => {
      panelElement.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, panelRef]);
}

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
 * Built in the same two pieces as that sidebar, and for the same reason: a gap
 * that gives the width away, and a panel of fixed width that slides in from
 * beyond the edge. Were the panel itself to grow out of nothing, its fields
 * would be squeezed on the way in rather than arriving whole.
 *
 * Below `md` there is no room to give away, so the gap keeps to itself and the
 * panel slides over the right edge — still with no overlay and nothing dimmed.
 */
export function FiltersPanelRegion() {
  const panel = useContext(FiltersPanelActionsContext);
  const { content } = useContext(FiltersPanelStateContext);
  const isOpen = content !== null;
  // What slid in has to still be there while it slides back out, so the panel
  // keeps drawing the last filters it was given until it is off the screen. The
  // remembering is an effect and not an assignment during the render, because a
  // render may be thrown away and this has to hold only what was really shown.
  const lastContentRef = useRef<FiltersPanelContent | null>(null);
  const shownContent = content ?? lastContentRef.current;
  const containerRef = useRef<HTMLElement>(null);
  const close = useCallback(() => panel?.close(), [panel]);

  useEffect(() => {
    if (content) {
      lastContentRef.current = content;
    }
  }, [content]);

  useCloseOnEscape(isOpen, close, containerRef);

  return (
    <div
      data-slot="filters-panel"
      data-state={isOpen ? "open" : "closed"}
      className="group/filters-panel text-sidebar-foreground"
    >
      {/* What hands the width over to the panel, and takes it back. */}
      <div
        data-slot="filters-panel-gap"
        className="relative hidden w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[state=closed]/filters-panel:w-0 md:block"
      />
      {/*
       * Closed, the panel is off the screen but still drawn, so `inert` keeps it
       * out of the reader's way —no focus, nothing announced— without taking
       * away what it needs in order to slide back out.
       */}
      <aside
        ref={containerRef}
        id={FILTERS_PANEL_REGION_ID}
        inert={!isOpen}
        data-slot="filters-panel-container"
        className="fixed inset-y-0 right-0 z-40 flex h-svh w-(--sidebar-width) bg-sidebar p-2 transition-[right] duration-200 ease-linear group-data-[state=closed]/filters-panel:right-[calc(var(--sidebar-width)*-1)] md:z-10 md:bg-transparent"
      >
        {shownContent ? (
          <div className="flex h-full w-full flex-col">
            <FiltersPanelBody
              content={shownContent}
              onClose={close}
              autoFocusClose={isOpen}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/**
 * The panel for a table with no shell around it: a test, or a surface that has
 * no region. It is portalled to the body so that the edge it sits against is
 * the screen's and not whichever ancestor happens to be positioned.
 *
 * It sets the width variable itself, because a table outside a shell is also
 * outside the `SidebarProvider` that would otherwise be setting it. The value
 * is the sidebar's own, so this panel and the region's cannot drift apart.
 *
 * Unlike the region it mirrors, this one does lie over the list: with no shell
 * to be laid out beside, there is nothing for it to push.
 */
export function StandaloneFiltersPanel({
  content,
  id,
  onClose,
}: {
  content: FiltersPanelContent;
  id: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLElement>(null);

  useCloseOnEscape(true, onClose, containerRef);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <aside
      ref={containerRef}
      id={id}
      data-slot="filters-panel"
      data-state="open"
      style={{ "--sidebar-width": SIDEBAR_WIDTH } as CSSProperties}
      className="fixed inset-y-0 right-0 z-40 flex w-(--sidebar-width) max-w-full flex-col border-l bg-sidebar text-sidebar-foreground shadow-lg"
    >
      <FiltersPanelBody autoFocusClose content={content} onClose={onClose} />
    </aside>,
    document.body,
  );
}

/**
 * Everything inside the panel, wherever the panel ends up. Every change applies
 * at once, so there is no `Aplicar`: the list re-filters behind the panel while
 * it is open and the reader watches it happen.
 */
function FiltersPanelBody({
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
  // What is published is read through refs rather than taken as dependencies,
  // so that the shape below is what decides when to republish and the effect
  // still hands over the objects the view built, not copies of them.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const publishedRef = useRef({ groups, selectedValues });
  publishedRef.current = { groups, selectedValues };
  const contentKey = JSON.stringify(publishedRef.current);

  useEffect(() => {
    if (!panel) {
      return;
    }

    const { groups: publishedGroups, selectedValues: publishedValues } =
      publishedRef.current;

    panel.publish(ownerId, {
      groups: publishedGroups,
      selectedValues: publishedValues,
      onChange: (values) => onChangeRef.current(values),
    });
    // `contentKey` is the shape of what is published: it is the dependency
    // precisely because the objects themselves are rebuilt on every render.
  }, [contentKey, ownerId, panel]);

  useEffect(() => {
    if (!panel) {
      return;
    }

    return () => panel.unpublish(ownerId);
  }, [ownerId, panel]);

  return {
    isAvailable: panel !== null,
    isOpen: openOwnerId === ownerId,
    toggle: () => panel?.toggle(ownerId),
  };
}
