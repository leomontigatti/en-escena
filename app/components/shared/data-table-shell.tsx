import {
  type ColumnDefTemplate,
  type Column,
  type Header,
  type Row,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { createContext, useContext, useId, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DataTablePagination,
  SortIcon,
} from "@/components/shared/data-table-controls";
import { DataTableFilters } from "@/components/shared/data-table-filters";
import { toSortDirection } from "@/components/shared/data-table-helpers";
import { DataTableTruncatedText } from "@/components/shared/data-table-truncated-text";
import { SearchInput } from "@/components/shared/search-input";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableLayout,
  DataTableReorder,
  DataTableSortDirection,
} from "@/components/shared/data-table.shared";
import {
  dataTableFacetedFilterColumnId,
  dataTableSelectionColumnId,
  dataTableSelectionColumnWeight,
} from "@/components/shared/data-table.shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

/** What the search box needs, and whether it is offered at all. */
type DataTableSearchProps = {
  hidden?: boolean;
  onChange: (value: string) => void;
  /**
   * What the clear button does, when emptying the box is worth more than the
   * debounce the typed value goes through. Without it, clearing is a change
   * like any other.
   */
  onClear?: () => void;
  placeholder: string;
  query: string;
};

/** The faceted filters, and how to read and write what is selected. */
type DataTableFiltersProps = {
  getSelectedValues: (columnId: string) => DataTableFacetedFilterValue;
  groups: DataTableFacetedFilter[];
  onChange: (values: DataTableFacetedFilterValue) => void;
};

/**
 * The footer: how much of the set is on screen, and the way to the rest. The
 * client table moves by callback and the server table by href, so both are
 * optional and each table fills in the pair it uses.
 */
type DataTablePaginationProps = {
  basePath: string;
  canNextPage: boolean;
  canPreviousPage: boolean;
  currentPage: number;
  filteredRowCount: number;
  hidden?: boolean;
  hrefBuilder?: (page: number) => string;
  onNextPage?: () => void;
  onPageChange?: (page: number) => void;
  onPreviousPage?: () => void;
  pageCount: number;
  totalRows: number;
};

/**
 * The server table's sort, which lives in the URL. It is absent on the client
 * table, and that absence is what tells a header to sort by button rather than
 * by link.
 */
type DataTableServerSortProps = {
  getDirection?: (columnId: string) => DataTableSortDirection | false;
  getHref: (columnId: string) => string;
};

/**
 * Grouped by region rather than flat. Twenty-five loose props said nothing
 * about which of them belong together; these four say which part of the table
 * each one is about, and a caller that fills in `serverSort` is answering one
 * question rather than remembering two prefixes.
 */
type DataTableShellProps<TData> = {
  emptyMessage: string;
  filters: DataTableFiltersProps;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  isLoading: boolean;
  layout: DataTableLayout;
  pagination: DataTablePaginationProps;
  reorder?: DataTableReorder;
  search: DataTableSearchProps;
  serverSort?: DataTableServerSortProps;
  table: TanStackTable<TData>;
};

type DataTableSortableRowHandle = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

const DataTableSortableRowContext =
  createContext<DataTableSortableRowHandle | null>(null);

/**
 * The grip a reorderable row is dragged by, rendered from a `leading` column.
 * It draws nothing while the table is not reorderable, which is how a view
 * hides the handles without changing its column list.
 */
export function DataTableDragHandle({ label }: { label: string }) {
  const sortable = useContext(DataTableSortableRowContext);

  if (!sortable) {
    return null;
  }

  return (
    <Button
      ref={sortable.setActivatorNodeRef}
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      className="cursor-grab touch-none text-muted-foreground"
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <GripVertical aria-hidden="true" />
    </Button>
  );
}

/**
 * The drag context around the rows on screen. `useId` gives it an id that is
 * the same on the server and on the client, which is what keeps the table
 * hydratable; the keyboard sensor is what makes a move reachable without a
 * pointer at all.
 */
function DataTableReorderProvider<TData>({
  children,
  reorder,
  table,
}: {
  children: ReactNode;
  reorder: DataTableReorder;
  table: TanStackTable<TData>;
}) {
  const id = useId();
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const itemIds = table.getRowModel().rows.map((row) => row.id);

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={(event: DragEndEvent) => {
        if (event.over && event.active.id !== event.over.id) {
          reorder.onMove(String(event.active.id), String(event.over.id));
        }
      }}
    >
      <SortableContext
        items={itemIds}
        strategy={verticalListSortingStrategy}
        disabled={!reorder.enabled}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Everything both tables draw, given a built TanStack table. It owns no state
 * and makes no decision about the data: the client table filters and pages in
 * memory, the server table does it through the URL, and by the time either one
 * reaches here the rows are already the rows to show.
 *
 * The four regions —toolbar, header, body, footer— are separate components
 * rather than four stretches of one return, so each can be read against the one
 * question it answers instead of against the table as a whole.
 */
export function DataTableShell<TData>({
  emptyMessage,
  filters,
  getRowProps,
  isLoading,
  layout,
  pagination,
  reorder,
  search,
  serverSort,
  table,
}: DataTableShellProps<TData>) {
  const tableElement = (
    <Table className={layout === "fit" ? "table-fixed" : undefined}>
      {layout === "fit" ? <DataTableColumnGroup table={table} /> : null}
      <DataTableHead
        isFit={layout === "fit"}
        serverSort={serverSort}
        table={table}
      />
      <DataTableBody
        emptyMessage={emptyMessage}
        getRowProps={getRowProps}
        isReorderable={Boolean(reorder?.enabled)}
        table={table}
      />
    </Table>
  );

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        filters={filters}
        isLoading={isLoading}
        search={search}
      />
      <div
        aria-busy={isLoading}
        className={cn(
          "rounded-lg border bg-background transition-opacity",
          // The rows stay put and fade after a beat, so a fast reload never
          // flickers; the way back is immediate. The spinner is in the search
          // box, where the reader acted, rather than in a footer that is off
          // screen on a long list.
          isLoading && "opacity-60 delay-150",
        )}
      >
        {reorder ? (
          <DataTableReorderProvider reorder={reorder} table={table}>
            {tableElement}
          </DataTableReorderProvider>
        ) : (
          tableElement
        )}
      </div>
      {!pagination.hidden ? <DataTableFooter pagination={pagination} /> : null}
    </div>
  );
}

/**
 * The row's widths, as a `colgroup` rather than a class on every cell.
 *
 * This is where a `fit` table's arithmetic lives, and it lives here because
 * this is the only place that can see all of it. A view declares what share of
 * the row each of its columns is worth; it cannot account for the selection
 * checkbox, because the table is what adds that column, and it should not have
 * to — so the fixed part comes out of the row first and the views' weights
 * divide what is left. That is also why the weights are relative: there is no
 * total to keep them adding up to, so no way to leave the row over-committed.
 *
 * A column with no weight is left to the browser, which under a fixed layout
 * means it shares whatever the weighted columns did not claim.
 */
function DataTableColumnGroup<TData>({
  table,
}: {
  table: TanStackTable<TData>;
}) {
  const columns = table.getVisibleLeafColumns();
  const totalWeight = columns.reduce(
    (total, column) => total + resolveDataTableColumnWeight(column),
    0,
  );

  return (
    <colgroup>
      {columns.map((column) => (
        <col
          key={column.id}
          style={{
            width: resolveDataTableColumnWidth({ column, totalWeight }),
          }}
        />
      ))}
    </colgroup>
  );
}

/**
 * The selection column's weight is the table's own; every other column's is
 * what the view declared. Sharing the row by weight alone is what keeps each
 * width a plain percentage — see `dataTableSelectionColumnWeight`.
 */
function resolveDataTableColumnWeight<TData>(column: Column<TData, unknown>) {
  return column.id === dataTableSelectionColumnId
    ? dataTableSelectionColumnWeight
    : (column.columnDef.meta?.width ?? 0);
}

function resolveDataTableColumnWidth<TData>({
  column,
  totalWeight,
}: {
  column: Column<TData, unknown>;
  totalWeight: number;
}) {
  const weight = resolveDataTableColumnWeight(column);

  if (!weight || totalWeight <= 0) {
    return undefined;
  }

  // Kept as a division rather than a percentage worked out here: the browser
  // divides exactly, and a weight stays the number the view wrote.
  return `calc(100% * ${weight} / ${totalWeight})`;
}

/**
 * The search box and the faceted filters. It draws nothing at all when the
 * table has neither: a list with one page and no facets has no controls to
 * offer, and an empty bar above it would read as a broken one.
 */
function DataTableToolbar({
  filters,
  isLoading,
  search,
}: {
  filters: DataTableFiltersProps;
  isLoading: boolean;
  search: DataTableSearchProps;
}) {
  const hasFacetedFilters = filters.groups.length > 0;

  if (search.hidden && !hasFacetedFilters) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!search.hidden ? (
        <DataTableSearchField isLoading={isLoading} search={search} />
      ) : null}
      {hasFacetedFilters ? (
        <DataTableFilters
          groups={filters.groups}
          selectedValues={filters.getSelectedValues(
            dataTableFacetedFilterColumnId,
          )}
          onChange={filters.onChange}
        />
      ) : null}
    </div>
  );
}

/** The search input, sized for the toolbar. */
function DataTableSearchField({
  isLoading,
  search,
}: {
  isLoading: boolean;
  search: DataTableSearchProps;
}) {
  return (
    <div className="w-full sm:w-80">
      <SearchInput
        isLoading={isLoading}
        aria-label="Buscar en la tabla"
        placeholder={search.placeholder}
        value={search.query}
        onClear={search.onClear}
        onValueChange={search.onChange}
      />
    </div>
  );
}

/**
 * The header rows. TanStack models headers as groups to allow stacked headers;
 * these tables have one group each, and the loop is here so that stays true by
 * construction rather than by assumption.
 */
function DataTableHead<TData>({
  isFit,
  serverSort,
  table,
}: {
  isFit: boolean;
  serverSort?: DataTableServerSortProps;
  table: TanStackTable<TData>;
}) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <TableHead
              key={header.id}
              className={cn(
                "px-3",
                header.column.columnDef.meta?.headerClassName,
              )}
            >
              <DataTableHeaderContent
                header={header}
                isFit={isFit}
                serverSort={serverSort}
              />
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}

/**
 * A header cell's content, in the three shapes it takes. A sortable column on
 * the server table sorts by link —the sort lives in the URL, so it has to be
 * navigable and shareable— and on the client table by button, where it is view
 * state. A column that cannot be sorted is neither, and renders bare.
 */
function DataTableHeaderContent<TData>({
  header,
  isFit,
  serverSort,
}: {
  header: Header<TData, unknown>;
  isFit: boolean;
  serverSort?: DataTableServerSortProps;
}) {
  const { header: definition } = header.column.columnDef;
  // A fixed column cannot grow to hold its header, and a header is never
  // wrapped, so a label longer than its column is cut the way a long cell is
  // instead of being drawn over the next column's.
  const label =
    isFit && typeof definition === "string" && definition !== "" ? (
      <DataTableTruncatedText className="min-w-0" value={definition} />
    ) : (
      <DataTableTemplate
        definition={definition}
        context={header.getContext()}
      />
    );
  // The `-ml-2` lines the label up with the cells below, so the button starts
  // half a unit left of the content box and may end that far past `100%`.
  const sortButtonClassName = cn(
    "-ml-2 text-sm",
    isFit && "max-w-[calc(100%+0.5rem)]",
  );

  if (!header.column.getCanSort()) {
    return label;
  }

  if (serverSort) {
    return (
      <Button asChild variant="ghost" size="sm" className={sortButtonClassName}>
        <Link to={serverSort.getHref(header.column.id)}>
          {label}
          <SortIcon direction={serverSort.getDirection?.(header.column.id)} />
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={sortButtonClassName}
      onClick={header.column.getToggleSortingHandler()}
    >
      {label}
      <SortIcon direction={toSortDirection(header.column.getIsSorted())} />
    </Button>
  );
}

/** The rows, or the one cell that says why there are none. */
function DataTableBody<TData>({
  emptyMessage,
  getRowProps,
  isReorderable,
  table,
}: {
  emptyMessage: string;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  isReorderable: boolean;
  table: TanStackTable<TData>;
}) {
  const visibleRows = table.getRowModel().rows;

  return (
    <TableBody>
      {visibleRows.length > 0 ? (
        visibleRows.map((row) => (
          <DataTableBodyRow
            key={row.id}
            getRowProps={getRowProps}
            isReorderable={isReorderable}
            row={row}
          />
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={table.getVisibleLeafColumns().length}
            className="h-24 text-center text-muted-foreground"
          >
            {emptyMessage}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

function DataTableBodyRow<TData>({
  getRowProps,
  isReorderable,
  row,
}: {
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  isReorderable: boolean;
  row: Row<TData>;
}) {
  if (isReorderable) {
    return <DataTableSortableBodyRow getRowProps={getRowProps} row={row} />;
  }

  return (
    <DataTableBodyRowCells
      row={row}
      rowProps={getRowProps?.(row.original) ?? {}}
    />
  );
}

/**
 * A row that can be dragged. The grip itself is a cell the view declares, so
 * the handle reaches its row's sortable through a context rather than through
 * a prop every column would have to carry.
 */
function DataTableSortableBodyRow<TData>({
  getRowProps,
  row,
}: {
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  row: Row<TData>;
}) {
  const sortable = useSortable({ id: row.id });
  const rowProps = getRowProps?.(row.original) ?? {};

  return (
    <DataTableSortableRowContext.Provider
      value={{
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        setActivatorNodeRef: sortable.setActivatorNodeRef,
      }}
    >
      <DataTableBodyRowCells
        row={row}
        rowProps={{
          ...rowProps,
          ref: sortable.setNodeRef,
          "data-dragging": sortable.isDragging || undefined,
          style: {
            ...rowProps.style,
            position: "relative",
            transform: CSS.Translate.toString(sortable.transform),
            transition: sortable.transition,
            zIndex: sortable.isDragging ? 1 : undefined,
          },
        }}
      />
    </DataTableSortableRowContext.Provider>
  );
}

function DataTableBodyRowCells<TData>({
  row,
  rowProps,
}: {
  row: Row<TData>;
  rowProps: React.ComponentProps<"tr"> & { "data-dragging"?: boolean };
}) {
  return (
    <TableRow
      {...rowProps}
      className={cn(rowProps.className, "data-[dragging=true]:bg-muted")}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cn(
            // Every list's rows are one height, whatever their cells hold: a
            // link, a badge or plain text each sit a pixel apart on their own.
            // A cell's height counts its padding, and is a floor: a taller
            // control still grows its row, so a list that needs one trims that
            // cell's padding to fit.
            "h-10 px-3",
            cell.column.columnDef.meta?.className,
            cell.column.columnDef.meta?.cellClassName?.(row.original),
          )}
        >
          <DataTableTemplate
            definition={cell.column.columnDef.cell}
            context={cell.getContext()}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * What a column declares for a header or a cell, drawn. TanStack's `flexRender`
 * mounts the declared function as the component itself, so a view that builds
 * its columns while rendering —most of them do— hands React a new component on
 * every render, and every cell is unmounted and mounted again: its state is
 * lost and its effects re-run, on each tick of a checkbox. Calling the function
 * from this one component keeps what it draws mounted.
 */
function DataTableTemplate<TContext extends object>({
  context,
  definition,
}: {
  context: TContext;
  definition: ColumnDefTemplate<TContext> | undefined;
}): React.ReactNode {
  return typeof definition === "function" ? definition(context) : definition;
}

/**
 * How much of the set is on screen, and the way to the rest of it. The count is
 * `filtered de total` so that a narrowed list says so: the reader needs to know
 * the number they are looking at is not the whole set.
 */
function DataTableFooter({
  pagination,
}: {
  pagination: DataTablePaginationProps;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {pagination.filteredRowCount} de {pagination.totalRows}{" "}
        {pagination.totalRows === 1 ? "registro" : "registros"}
      </p>
      <DataTablePagination
        basePath={pagination.basePath}
        pageCount={pagination.pageCount}
        currentPage={pagination.currentPage}
        canPreviousPage={pagination.canPreviousPage}
        canNextPage={pagination.canNextPage}
        onPreviousPage={pagination.onPreviousPage}
        onNextPage={pagination.onNextPage}
        onPageChange={pagination.onPageChange}
        pageHrefBuilder={pagination.hrefBuilder}
      />
    </div>
  );
}
