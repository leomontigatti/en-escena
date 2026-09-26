import { MergeDialog, MergeSummary } from "@/features/admin/merge/dialog";
import {
  describeAcademyMerge,
  formatAcademyMergeCandidateLabel,
  mergeAcademyIntent,
} from "@/lib/academies/academy-merge.shared";

import type { AcademyDetailLoaderData } from "./shared";

/**
 * `Fusionar` on an academy detail: the academy on screen is the one removed,
 * with its user, and the survivor is picked from every other academy.
 */
export function AcademyMergeDialog({
  academy,
  merge,
  onOpenChange,
  open,
  refusal,
}: {
  academy: AcademyDetailLoaderData["academy"];
  merge: AcademyDetailLoaderData["merge"];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  refusal?: string;
}) {
  if (!merge) {
    return null;
  }

  return (
    <MergeDialog
      candidates={merge.candidates.map((candidate) => ({
        label: formatAcademyMergeCandidateLabel(candidate),
        value: candidate.id,
      }))}
      description={`${academy.name} y su usuario de acceso se eliminan, y todo lo que tiene pasa a la academia que elijas. Solo procede si no tiene comprobantes y si ningún documento está en las dos academias.`}
      emptyMessage="No hay otra academia."
      intentValue={mergeAcademyIntent}
      label="Academia que queda"
      onOpenChange={onOpenChange}
      open={open}
      recordId={academy.id}
      refusal={refusal}
      renderSummary={(survivorId) => {
        const survivor = merge.candidates.find(
          (candidate) => candidate.id === survivorId,
        );

        return survivor ? (
          <MergeSummary
            {...describeAcademyMerge({
              holdings: merge.holdings,
              removed: { email: academy.email, name: academy.name },
              survivor,
            })}
          />
        ) : null;
      }}
      title="Fusionar academia"
    />
  );
}
