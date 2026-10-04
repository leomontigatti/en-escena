import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The participation list's actions menu: printing results, downloading the
 * day's music, exporting the program and showing or hiding it first, then the
 * ordering and the two judge dialogs. Every item opens a dialog the list owns,
 * so the menu only says which one. With nothing to offer there is no menu.
 */
type OutputActionsProps = {
  canDownloadMusic: boolean;
  canExportProgram: boolean;
  canPrintResults: boolean;
  onDownloadMusic: () => void;
  onExportProgram: () => void;
  onPrintResults: () => void;
  onToggleProgram: () => void;
  /**
   * Which way the program's visibility can go, for the event the list shows;
   * `null` when there is nothing to toggle.
   */
  programToggle: { eventId: string; show: boolean } | null;
};

type OrderingActionsProps = {
  /** The judge dialogs act on the selected rows, so they need some. */
  hasSelection: boolean;
  onJudges: (mode: "assign" | "remove") => void;
  onOrder: () => void;
};

export function PresentationListActions({
  canOrderRows,
  ...props
}: OutputActionsProps &
  OrderingActionsProps & {
    canOrderRows: boolean;
  }) {
  const hasOutputs =
    props.canPrintResults ||
    props.canDownloadMusic ||
    props.canExportProgram ||
    props.programToggle !== null;

  if (!canOrderRows && !hasOutputs) {
    return null;
  }

  return (
    <ResourceActionsMenu>
      <OutputItems {...props} />
      {hasOutputs && canOrderRows ? <DropdownMenuSeparator /> : null}
      {canOrderRows ? <OrderingItems {...props} /> : null}
    </ResourceActionsMenu>
  );
}

function OutputItems({
  canDownloadMusic,
  canExportProgram,
  canPrintResults,
  onDownloadMusic,
  onExportProgram,
  onPrintResults,
  onToggleProgram,
  programToggle,
}: OutputActionsProps) {
  return (
    <>
      {canPrintResults ? (
        <DialogItem label="Imprimir resultados" onOpen={onPrintResults} />
      ) : null}
      {canDownloadMusic ? (
        <DialogItem label="Descargar audios" onOpen={onDownloadMusic} />
      ) : null}
      {canExportProgram ? (
        <DialogItem label="Descargar programa" onOpen={onExportProgram} />
      ) : null}
      {programToggle ? (
        <DialogItem
          label={programToggle.show ? "Mostrar programa" : "Ocultar programa"}
          onOpen={onToggleProgram}
        />
      ) : null}
    </>
  );
}

function OrderingItems({
  hasSelection,
  onJudges,
  onOrder,
}: OrderingActionsProps) {
  return (
    <>
      <DialogItem label="Ordenar automáticamente" onOpen={onOrder} />
      <DropdownMenuSeparator />
      <DialogItem
        disabled={!hasSelection}
        label="Asignar jueces"
        onOpen={() => onJudges("assign")}
      />
      <DialogItem
        disabled={!hasSelection}
        label="Quitar jueces"
        onOpen={() => onJudges("remove")}
      />
    </>
  );
}

/** An item that opens one of the list's dialogs rather than closing the menu on its own. */
function DialogItem({
  disabled,
  label,
  onOpen,
}: {
  disabled?: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      {label}
    </DropdownMenuItem>
  );
}
