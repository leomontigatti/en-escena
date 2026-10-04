import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The participation list's actions menu: printing results, downloading the
 * day's music and exporting the program first, then the ordering and the two
 * judge dialogs. Every item opens a dialog the list owns, so the menu only says
 * which one; with nothing to offer there is no menu.
 */
export function PresentationListActions({
  canDownloadMusic,
  canExportProgram,
  canOrderRows,
  canPrintResults,
  hasSelection,
  onDownloadMusic,
  onExportProgram,
  onJudges,
  onOrder,
  onPrintResults,
}: {
  canDownloadMusic: boolean;
  canExportProgram: boolean;
  canOrderRows: boolean;
  canPrintResults: boolean;
  /** The judge dialogs act on the selected rows, so they need some. */
  hasSelection: boolean;
  onDownloadMusic: () => void;
  onExportProgram: () => void;
  onJudges: (mode: "assign" | "remove") => void;
  onOrder: () => void;
  onPrintResults: () => void;
}) {
  const hasOutputs = canPrintResults || canDownloadMusic || canExportProgram;

  if (!canOrderRows && !hasOutputs) {
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
          Descargar audios
        </DropdownMenuItem>
      ) : null}
      {canExportProgram ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onExportProgram();
          }}
        >
          Descargar programa (Excel)
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
            Asignar jueces
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={(event) => {
              event.preventDefault();
              onJudges("remove");
            }}
          >
            Quitar jueces
          </DropdownMenuItem>
        </>
      ) : null}
    </ResourceActionsMenu>
  );
}
