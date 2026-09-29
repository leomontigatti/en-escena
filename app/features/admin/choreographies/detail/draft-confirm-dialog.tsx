import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatAmount } from "@/lib/finances/formatters";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import type { ChoreographyDraftConsequences } from "./draft.shared";

/**
 * Opens only when the save reaches past the fields the administrator edited,
 * and names each consequence: who is withdrawn, and what moves from what to
 * what. Everything it lists came from the server's preview of this very draft.
 */
export function ConfirmDraftDialog({
  consequences,
  onConfirm,
  onOpenChange,
  open,
}: {
  consequences: ChoreographyDraftConsequences | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const moves = consequences ? listMoves(consequences) : [];
  const withdrawnDancers = consequences?.withdrawnDancers ?? [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar cambios</AlertDialogTitle>
          <AlertDialogDescription>
            Guardar esta coreografía también cambia lo siguiente. Revisalo antes
            de confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          {moves.length > 0 ? (
            <ul className="list-disc pl-5">
              {moves.map((move) => (
                <li key={move.label}>
                  {move.label}: {move.from} → {move.to}
                </li>
              ))}
            </ul>
          ) : null}
          {withdrawnDancers.length > 0 ? (
            <div className="flex flex-col gap-2">
              <ul className="list-disc pl-5">
                {withdrawnDancers.map((dancer) => (
                  <li key={dancer.id}>{dancer.name}: inscripción retirada</li>
                ))}
              </ul>
              <p>
                {withdrawnDancers.length === 1
                  ? "Su inscripción tiene dinero asignado o un comprobante emitido, así que no se borra: conserva el dinero y sigue en el comprobante."
                  : "Sus inscripciones tienen dinero asignado o un comprobante emitido, así que no se borran: conservan el dinero y siguen en el comprobante."}{" "}
                Volver a agregar al bailarín la reactiva.
              </p>
            </div>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Confirmar y guardar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function listMoves(consequences: ChoreographyDraftConsequences) {
  const moves: Array<{ from: string; label: string; to: string }> = [];

  if (consequences.category) {
    moves.push({ label: "Categoría", ...consequences.category });
  }

  if (consequences.groupType) {
    moves.push({
      from: formatGroupTypeLabel(consequences.groupType.from),
      label: "Tipo de grupo",
      to: formatGroupTypeLabel(consequences.groupType.to),
    });
  }

  if (consequences.scheduleCapacity) {
    moves.push({ label: "Cronograma", ...consequences.scheduleCapacity });
  }

  if (consequences.price) {
    moves.push({
      from: formatPrice(consequences.price.from),
      label: "Precio por bailarín",
      to: formatPrice(consequences.price.to),
    });
  }

  return moves;
}

function formatPrice(amount: number | null) {
  return amount === null ? "sin precio" : formatAmount(amount);
}
