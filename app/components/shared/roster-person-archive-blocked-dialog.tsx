import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import {
  rosterPersonNoun,
  type RosterPersonKind,
} from "@/lib/roster/roster-person-kind.shared";

/**
 * What `Archivar` opens instead of its confirmation while the person takes part
 * in the active event. Participating is the normal state of most of the roster
 * during an event, so the action stays enabled and the click says why (style
 * guide, Detail pages). The four detail screens share it so they cannot word
 * the same block four ways; the reason names no choreography, which the
 * `Inscripciones` tab already lists.
 */
export function RosterPersonArchiveBlockedDialog({
  kind,
  onOpenChange,
  open,
}: {
  kind: RosterPersonKind;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <BlockedActionDialog
      description="Para archivarlo, primero quitalo de las coreografías y los seminarios del evento activo."
      onOpenChange={onOpenChange}
      open={open}
      reasons="Está en una coreografía o un seminario del evento activo."
      reasonsTitle="Participa del evento activo"
      title={`No se puede archivar al ${rosterPersonNoun(kind, "singular")}`}
    />
  );
}
