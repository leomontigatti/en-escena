import {
  allocateToSeminarInscription,
  readSeminarInscriptionMoneyTarget,
  releaseSeminarInscriptionExcess,
  removeFromSeminarInscription,
} from "@/lib/finances/seminar-inscription-allocation.server";

import {
  allocateInscriptionIntent,
  readAllocationTargetKind,
  readMoneyAmount,
  readPickedPriceId,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
} from "./intents";

export type SeminarMoneyRefusal = { message: string; status: "error" };

const seminarMoneyIntents: readonly string[] = [
  allocateInscriptionIntent,
  removeInscriptionMoneyIntent,
  releaseInscriptionExcessIntent,
];

/**
 * The three money gestures of a seminar inscription, for every screen that
 * mounts the money dialog on one: the `(seminar, academy)` detail and the
 * event-wide seminar inscriptions list. The form names the inscription and
 * nothing else; its academy and its seminar are read off it, so the action
 * does not depend on which screen it was posted from.
 *
 * The gestures differ only in what they read off the form: an amount for two
 * of them and nothing at all for the release, whose figure is computed.
 * Returns `null` when the write went through, leaving each screen to decide
 * what follows (the detail redirects to itself, the list stays); a refusal
 * otherwise, which keeps the dialog open with what the administrator typed.
 */
export async function runSeminarInscriptionMoneyIntent(input: {
  eventId: string;
  formData: FormData;
}): Promise<SeminarMoneyRefusal | null> {
  const intent = String(input.formData.get("intent") ?? "");

  // The shared dialog carries the kind it is about, and this action owns one
  // of them: a choreography target reaching here is a form pointed at the
  // wrong writer, not an inscription that went missing.
  if (
    !seminarMoneyIntents.includes(intent) ||
    readAllocationTargetKind(input.formData) !== "seminar"
  ) {
    return { status: "error", message: "No pudimos procesar esa acción." };
  }

  const inscriptionId = String(
    input.formData.get("inscriptionId") ?? "",
  ).trim();
  const target = inscriptionId
    ? await readSeminarInscriptionMoneyTarget({
        eventId: input.eventId,
        inscriptionId,
      })
    : null;

  if (target === null) {
    return { status: "error", message: "No encontramos esa inscripción." };
  }

  if (intent === releaseInscriptionExcessIntent) {
    const released = await releaseSeminarInscriptionExcess(target);

    return released.ok ? null : { status: "error", message: released.message };
  }

  const amount = readMoneyAmount(input.formData);

  if (amount === null) {
    return { status: "error", message: "Ingresá un monto mayor a 0." };
  }

  const result =
    intent === allocateInscriptionIntent
      ? await allocateToSeminarInscription({
          ...target,
          amount,
          priceId: readPickedPriceId(input.formData),
        })
      : await removeFromSeminarInscription({ ...target, amount });

  return result.ok ? null : { status: "error", message: result.message };
}
