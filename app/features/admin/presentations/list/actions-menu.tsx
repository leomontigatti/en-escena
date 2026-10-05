import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The participation list's actions menu: downloading the day's music,
 * exporting the program and choosing which of its days are visible first, then the ordering and
 * the two judge dialogs. Every item opens a dialog the list owns, so the menu
 * only says which one. With nothing to offer there is no menu.
 */
type OutputActionsProps = {
  canDownloadMusic: boolean;
  canExportProgram: boolean;
  onDownloadMusic: () => void;
  onExportProgram: () => void;
  onProgramVisibility: () => void;
  /**
   * Whether some day of the program can be shown or hidden: one has a
   * numbered presentation, or one is visible now.
   */
  canSetProgramVisibility: boolean;
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
    props.canDownloadMusic ||
    props.canExportProgram ||
    props.canSetProgramVisibility;

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
  canSetProgramVisibility,
  onDownloadMusic,
  onExportProgram,
  onProgramVisibility,
}: OutputActionsProps) {
  return (
    <>
      {canDownloadMusic ? (
        <DialogItem label="Descargar audios" onOpen={onDownloadMusic} />
      ) : null}
      {canExportProgram ? (
        <DialogItem label="Descargar programa" onOpen={onExportProgram} />
      ) : null}
      {canSetProgramVisibility ? (
        <DialogItem
          label="Mostrar/ocultar programa"
          onOpen={onProgramVisibility}
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

/**
 * An item that opens one of the list's dialogs. The menu closes as it does:
 * the dialog takes the focus, and a menu left open behind it would hold it.
 */
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
    <DropdownMenuItem disabled={disabled} onSelect={() => onOpen()}>
      {label}
    </DropdownMenuItem>
  );
}
