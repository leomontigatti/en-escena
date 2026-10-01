import type { FetcherWithComponents } from "react-router";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { formatDancerName } from "@/lib/finances/formatters";

import type { loadChoreographyFinanceDetail } from "./server";
import {
  type ChoreographyFinanceActionData,
  unwaiveInscriptionIntent,
  waiveInscriptionIntent,
} from "./shared";

type InscriptionRow = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>["inscriptions"][number];

export type InscriptionWaiverConfirmation = {
  inscription: InscriptionRow;
  kind: "unwaive" | "waive";
};

const waiverFormId = "inscription-waiver-form";

/**
 * The question the `Bonificada` waiver asks before it acts (ADR-0017). Waiving
 * gives something and reverses nothing, so its verb is the default button;
 * taking the waiver off reverses one, so it is `destructive`.
 *
 * It submits through the fetcher its caller owns: the confirmation closes on
 * the click, and the caller stays mounted to read the answer.
 */
export function InscriptionWaiverConfirmationDialog({
  confirmation,
  fetcher,
  onClose,
}: {
  confirmation: InscriptionWaiverConfirmation;
  fetcher: FetcherWithComponents<ChoreographyFinanceActionData>;
  onClose: () => void;
}) {
  const name = formatDancerName(confirmation.inscription);
  const copy =
    confirmation.kind === "waive"
      ? {
          confirmLabel: "Bonificar",
          description: `La inscripción de ${name} pasa a ser gratis: no adeuda nada y participa igual que las demás.`,
          destructive: false,
          intent: waiveInscriptionIntent,
          title: "¿Bonificar la inscripción?",
        }
      : {
          confirmLabel: "Quitar",
          description: `La inscripción de ${name} vuelve al precio que le corresponde y queda con la seña pendiente. Si la coreografía ya tiene número de presentación, lo conserva.`,
          destructive: true,
          intent: unwaiveInscriptionIntent,
          title: "¿Quitar la bonificación?",
        };

  return (
    <ConfirmationDialog
      confirmLabel={copy.confirmLabel}
      description={copy.description}
      destructive={copy.destructive}
      form={waiverFormId}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={copy.title}
    >
      <fetcher.Form id={waiverFormId} method="post">
        <input type="hidden" name="intent" value={copy.intent} />
        <input
          type="hidden"
          name="inscriptionId"
          value={confirmation.inscription.inscriptionId ?? ""}
        />
      </fetcher.Form>
    </ConfirmationDialog>
  );
}
