import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { DataTableSortDirection } from "@/components/shared/data-table.shared";
import { getPaginationPages } from "@/components/shared/data-table-helpers";
import { cn } from "@/lib/shared/utils";

type DataTablePaginationProps = {
  basePath: string;
  pageCount: number;
  currentPage: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onPageChange?: (page: number) => void;
  pageHrefBuilder?: (page: number) => string;
};

type SortIconProps = {
  direction?: DataTableSortDirection | false;
};

export function DataTablePagination({
  basePath,
  pageCount,
  currentPage,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageChange,
  pageHrefBuilder,
}: DataTablePaginationProps) {
  const pages = getPaginationPages(pageCount, currentPage);
  const previousHref =
    pageHrefBuilder?.(Math.max(1, currentPage - 1)) ?? basePath;
  const nextHref =
    pageHrefBuilder?.(Math.min(pageCount, currentPage + 1)) ?? basePath;

  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={previousHref}
            text="Anterior"
            aria-disabled={!canPreviousPage}
            tabIndex={canPreviousPage ? undefined : -1}
            className={cn(!canPreviousPage && "pointer-events-none opacity-50")}
            onClick={(event) => {
              if (!canPreviousPage) {
                event.preventDefault();
                return;
              }

              if (pageHrefBuilder) {
                return;
              }

              event.preventDefault();
              onPreviousPage?.();
            }}
          />
        </PaginationItem>
        {pages.map((page) => (
          <PaginationItem key={page}>
            {page === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={pageHrefBuilder?.(page) ?? basePath}
                isActive={page === currentPage}
                onClick={(event) => {
                  if (pageHrefBuilder) {
                    return;
                  }

                  event.preventDefault();
                  onPageChange?.(page);
                }}
              >
                {page}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href={nextHref}
            text="Siguiente"
            aria-disabled={!canNextPage}
            tabIndex={canNextPage ? undefined : -1}
            className={cn(!canNextPage && "pointer-events-none opacity-50")}
            onClick={(event) => {
              if (!canNextPage) {
                event.preventDefault();
                return;
              }

              if (pageHrefBuilder) {
                return;
              }

              event.preventDefault();
              onNextPage?.();
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export function SortIcon({ direction }: SortIconProps) {
  if (direction === "asc") {
    return <ArrowUp data-icon="inline-end" />;
  }

  if (direction === "desc") {
    return <ArrowDown data-icon="inline-end" />;
  }

  return <ArrowUpDown data-icon="inline-end" />;
}
