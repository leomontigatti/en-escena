import { ListOrdered, Printer, UserMinus, UserPlus } from "lucide-react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The participation list's actions menu: printing results first, then the
 * ordering and the two judge dialogs. Every item opens a dialog the list owns,
 * so the menu only says which one; with nothing to offer there is no menu.
 */
export function PresentationListActions({
  canOrderRows,
  canPrintResults,
  hasSelection,
  onJudges,
  onOrder,
  onPrintResults,
}: {
  canOrderRows: boolean;
  canPrintResults: boolean;
  /** The judge dialogs act on the selected rows, so they need some. */
  hasSelection: boolean;
  onJudges: (mode: "assign" | "remove") => void;
  onOrder: () => void;
  onPrintResults: () => void;
}) {
  if (!canOrderRows && !canPrintResults) {
    return null;
  }

  return (
    <ResourceActionsMenu>
      {canPrintResults ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onPrintResults();
          }}
        >
          <Printer aria-hidden="true" />
          Imprimir resultados
        </DropdownMenuItem>
      ) : null}
      {canPrintResults && canOrderRows ? <DropdownMenuSeparator /> : null}
      {canOrderRows ? (
        <>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onOrder();
            }}
          >
            <ListOrdered aria-hidden="true" />
            Ordenar automáticamente
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={(event) => {
              event.preventDefault();
              onJudges("assign");
            }}
          >
            <UserPlus aria-hidden="true" />
            Asignar jueces
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={(event) => {
              event.preventDefault();
              onJudges("remove");
            }}
          >
            <UserMinus aria-hidden="true" />
            Quitar jueces
          </DropdownMenuItem>
        </>
      ) : null}
    </ResourceActionsMenu>
  );
}
