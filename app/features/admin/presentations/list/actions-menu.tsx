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
        <DropdownMenuItem onSelect={() => onPrintResults()}>
          Imprimir resultados
        </DropdownMenuItem>
      ) : null}
      {canDownloadMusic ? (
        <DropdownMenuItem onSelect={() => onDownloadMusic()}>
          Descargar audios
        </DropdownMenuItem>
      ) : null}
      {hasOutputs && canOrderRows ? <DropdownMenuSeparator /> : null}
      {canOrderRows ? (
        <>
          <DropdownMenuItem onSelect={() => onOrder()}>
            Ordenar automáticamente
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={() => onJudges("assign")}
          >
            Asignar jueces
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={() => onJudges("remove")}
          >
            Quitar jueces
          </DropdownMenuItem>
        </>
      ) : null}
    </ResourceActionsMenu>
  );
}
