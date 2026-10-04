import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";

/**
 * What `Emitir factura` opens instead of the emission when nothing is left to
 * bill: the item stays enabled on both finance details (style guide, Detail
 * pages), and the click says why there is nothing to emit. The server refuses
 * an empty emission all the same.
 */
export function NothingToBillDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <BlockedActionDialog
      description="Se puede emitir cuando haya dinero asignado que ningún comprobante cubra."
      onOpenChange={onOpenChange}
      open={open}
      reasons="No hay dinero asignado sin facturar."
      reasonsTitle="Nada para facturar"
      title="No se puede emitir la factura"
    />
  );
}
