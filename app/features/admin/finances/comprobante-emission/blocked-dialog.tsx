import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ReasonList } from "@/components/shared/reason-list";

import type { AnchorInvoicing } from "./shared";

/**
 * What the `Emitir` item opens instead of the emission when the unit owes no
 * document: the item stays enabled on both finance details (style guide,
 * Detail pages), and the click says why, in the words the emitter would refuse
 * with. The server refuses all the same.
 */
export function EmissionBlockedDialog({
  invoicing,
  onOpenChange,
  open,
}: {
  invoicing: Extract<AnchorInvoicing, { status: "blocked" }>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <BlockedActionDialog
      description={invoicing.remedy}
      onOpenChange={onOpenChange}
      open={open}
      reasons={
        <ReasonList reasons={invoicing.reasons.map((reason) => reason.label)} />
      }
      reasonsTitle="Nada para emitir"
      title={
        invoicing.invoiced
          ? "No se puede emitir una nota"
          : "No se puede emitir la factura"
      }
    />
  );
}
