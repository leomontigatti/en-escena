import type { FetcherWithComponents } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";

import type { loadChoreographyFinanceDetail } from "./server";
import {
  type ChoreographyFinanceActionData,
  unwaiveChoreographyIntent,
  unwaiveInscriptionIntent,
  waiveChoreographyIntent,
  waiveInscriptionIntent,
} from "./shared";

type InscriptionRow = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>["inscriptions"][number];

/**
 * What the waiver is about to do: to one inscription, or to every active
 * inscription of the choreography, `count` being how many it changes.
 */
export type WaiverConfirmation =
  | {
      inscription: InscriptionRow;
      kind: "unwaiveInscription" | "waiveInscription";
    }
  | { count: number; kind: "unwaiveChoreography" | "waiveChoreography" };

const waiverFormId = "waiver-form";

/**
 * The question the `Bonificada` waiver asks before it acts (ADR-0017). Waiving
 * gives something and reverses nothing, so its verb is the default button;
 * taking the waiver off reverses one, so it is `destructive`.
 *
 * It submits through the fetcher its caller owns: the confirmation closes on
 * the click, and the caller stays mounted to read the answer.
 */
export function WaiverConfirmationDialog({
  confirmation,
  fetcher,
  onClose,
}: {
  confirmation: WaiverConfirmation;
  fetcher: FetcherWithComponents<ChoreographyFinanceActionData>;
  onClose: () => void;
}) {
  const copy = waiverCopy(confirmation);

  return (
    <ConfirmationDialog
      confirmLabel={copy.destructive ? "Quitar" : "Bonificar"}
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
        {"inscription" in confirmation ? (
          <input
            type="hidden"
            name="inscriptionId"
            value={confirmation.inscription.inscriptionId ?? ""}
          />
        ) : null}
      </fetcher.Form>
    </ConfirmationDialog>
  );
}

function waiverCopy(confirmation: WaiverConfirmation) {
  switch (confirmation.kind) {
    case "waiveInscription":
      return {
        description: `La inscripción de ${formatDancerName(confirmation.inscription)} pasa a ser gratis: no adeuda nada y participa igual que las demás.`,
        destructive: false,
        intent: waiveInscriptionIntent,
        title: "¿Bonificar la inscripción?",
      };
    case "unwaiveInscription":
      return {
        description: `La inscripción de ${formatDancerName(confirmation.inscription)} vuelve al precio que le corresponde y queda con la seña pendiente. Si la coreografía ya tiene número de presentación, lo conserva.`,
        destructive: true,
        intent: unwaiveInscriptionIntent,
        title: "¿Quitar la bonificación?",
      };
    case "waiveChoreography":
      return {
        description:
          confirmation.count === 1
            ? "Su inscripción pasa a ser gratis: no adeuda nada y participa igual que las demás."
            : `Sus ${confirmation.count} inscripciones pasan a ser gratis: no adeudan nada y participan igual que las demás.`,
        destructive: false,
        intent: waiveChoreographyIntent,
        title: "¿Bonificar la coreografía?",
      };
    case "unwaiveChoreography":
      return {
        description:
          confirmation.count === 1
            ? "Su inscripción vuelve al precio que le corresponde y queda con la seña pendiente. Si ya tiene número de presentación, lo conserva."
            : `Sus ${confirmation.count} inscripciones vuelven al precio que les corresponde y quedan con la seña pendiente. Si ya tiene número de presentación, lo conserva.`,
        destructive: true,
        intent: unwaiveChoreographyIntent,
        title: "¿Quitar la bonificación de la coreografía?",
      };
  }
}

/**
 * What `Bonificar coreografía` opens while any inscription holds money: the
 * acknowledgment of a blocked action, naming each inscription in the way. The
 * item stays enabled because holding money is the normal state of a paid
 * choreography, and a standing alert would sit on nearly every one.
 */
export function ChoreographyWaiverBlockedDialog({
  inscriptionsWithMoney,
  onClose,
}: {
  inscriptionsWithMoney: InscriptionRow[];
  onClose: () => void;
}) {
  return (
    <BlockedActionDialog
      description="Para bonificarla, primero quitá el dinero de sus inscripciones desde la lista. Al quitarlo vuelve al saldo disponible de la academia."
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      reasons={
        <ul className="list-disc pl-5">
          {inscriptionsWithMoney.map((inscription) => (
            <li key={inscription.dancerId}>
              {formatDancerName(inscription)} tiene{" "}
              {formatAmount(inscription.allocatedAmount)} asignados.
            </li>
          ))}
        </ul>
      }
      reasonsTitle="Inscripciones con dinero asignado"
      title="No se puede bonificar la coreografía"
    />
  );
}
