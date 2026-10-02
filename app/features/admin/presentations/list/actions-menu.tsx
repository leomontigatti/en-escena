import {
  Download,
  ListOrdered,
  Printer,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The participation list's actions menu: printing results and downloading the
 * day's music first, then the ordering and the two judge dialogs. Every item opens a dialog the list owns,
 * so the menu only says which one; with nothing to offer there is no menu.
 */
export function PresentationListActions({
  canDownloadMusic,
  canOrderRows,
  canPrintResults,
  hasSelection,
  onDownloadMusic,
  onJudges,
  onOrder,
  onPrintResults,
}: {
  canDownloadMusic: boolean;
  canOrderRows: boolean;
  canPrintResults: boolean;
  /** The judge dialogs act on the selected rows, so they need some. */
  hasSelection: boolean;
  onDownloadMusic: () => void;
  onJudges: (mode: "assign" | "remove") => void;
  onOrder: () => void;
  onPrintResults: () => void;
}) {
  if (!canOrderRows && !canPrintResults && !canDownloadMusic) {
    return null;
  }

  const hasOutputs = canPrintResults || canDownloadMusic;

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
      {canDownloadMusic ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onDownloadMusic();
          }}
        >
          <Download aria-hidden="true" />
          Descargar audios
        </DropdownMenuItem>
      ) : null}
      {hasOutputs && canOrderRows ? <DropdownMenuSeparator /> : null}
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
