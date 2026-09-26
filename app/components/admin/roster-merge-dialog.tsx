import { MergeDialog, MergeSummary } from "@/components/admin/merge-dialog";
import {
  describeRosterMerge,
  formatRosterMergeCandidateLabel,
  getRosterMergeKindCopy,
  rosterMergeIntents,
  type RosterMergeCandidate,
  type RosterMergeEventInscriptions,
} from "@/lib/roster/roster-merge.shared";
import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";

/**
 * `Fusionar` on a dancer or a professor detail: the person on screen is the
 * one removed, and the survivor is picked from the rest of the academy's
 * roster of the same kind.
 */
export function RosterMergeDialog({
  kind,
  merge,
  onOpenChange,
  open,
  person,
  refusal,
}: {
  kind: RosterPersonKind;
  /** `null` for a read-only auditor, who gets no dialog at all. */
  merge: {
    candidates: RosterMergeCandidate[];
    inscriptionsByEvent: RosterMergeEventInscriptions[];
  } | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  person: {
    documentNumber: string | null;
    firstName: string;
    id: string;
    lastName: string;
  };
  refusal?: string;
}) {
  if (!merge) {
    return null;
  }

  const { candidates, inscriptionsByEvent } = merge;
  const copy = getRosterMergeKindCopy(kind);
  const name = `${person.firstName} ${person.lastName}`;

  return (
    <MergeDialog
      candidates={candidates.map((candidate) => ({
        label: formatRosterMergeCandidateLabel(candidate),
        value: candidate.id,
      }))}
      description={`${name} se elimina y todo lo que tiene pasa al ${copy.singular} que elijas, que conserva sus propios datos.`}
      emptyMessage={`No hay otro ${copy.singular} en la academia.`}
      intentValue={rosterMergeIntents[kind]}
      label={`${capitalize(copy.singular)} que queda`}
      onOpenChange={onOpenChange}
      open={open}
      recordId={person.id}
      refusal={refusal}
      renderSummary={(survivorId) => {
        const survivor = candidates.find(
          (candidate) => candidate.id === survivorId,
        );

        return survivor ? (
          <MergeSummary
            {...describeRosterMerge({
              inscriptionsByEvent,
              kind,
              removed: { documentNumber: person.documentNumber, name },
              survivor,
            })}
          />
        ) : null;
      }}
      title={`Fusionar ${copy.singular}`}
    />
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
