import { MergeDialog, MergeSummary } from "@/features/admin/merge/dialog";
import {
  describeRosterMerge,
  formatRosterMergeCandidateLabel,
  rosterMergeIntents,
  type RosterMergeCandidate,
  type RosterMergeEventInscriptions,
} from "@/lib/roster/roster-merge.shared";
import {
  rosterPersonNoun,
  type RosterPersonKind,
} from "@/lib/roster/roster-person-kind.shared";

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
    /** Only a dancer can be verified; a professor is always `false`. */
    isIdentityVerified: boolean;
    lastName: string;
  };
}) {
  if (!merge) {
    return null;
  }

  const { candidates, inscriptionsByEvent } = merge;
  const noun = rosterPersonNoun(kind, "singular");
  const name = `${person.firstName} ${person.lastName}`;

  return (
    <MergeDialog
      candidates={candidates.map((candidate) => ({
        label: formatRosterMergeCandidateLabel(candidate),
        value: candidate.id,
      }))}
      description={`${name} se elimina y todo lo que tiene pasa al ${noun} que elijas, que conserva sus propios datos.`}
      emptyMessage={`No hay otro ${noun} en la academia.`}
      intentValue={rosterMergeIntents[kind]}
      label={`${rosterPersonNoun(kind, "singularCapitalized")} que queda`}
      onOpenChange={onOpenChange}
      open={open}
      recordId={person.id}
      renderSummary={(survivorId) => {
        const survivor = candidates.find(
          (candidate) => candidate.id === survivorId,
        );

        return survivor ? (
          <MergeSummary
            {...describeRosterMerge({
              inscriptionsByEvent,
              kind,
              removed: {
                documentNumber: person.documentNumber,
                isIdentityVerified: person.isIdentityVerified,
                name,
              },
              survivor,
            })}
          />
        ) : null;
      }}
      title={`¿Fusionar al ${noun}?`}
    />
  );
}
