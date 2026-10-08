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

/** What a money gesture answers: a refusal keeps the dialog open; a success
 * is for the screen that stays put to read out. */
export type SeminarMoneyAnswer =
  { message: string; status: "error" } | { message: string; status: "success" };

const successMessages: Record<string, string> = {
  [allocateInscriptionIntent]: "Dinero asignado.",
  [releaseInscriptionExcessIntent]: "Excedente liberado.",
  [removeInscriptionMoneyIntent]: "Dinero quitado.",
};

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
 * A screen about one `(seminar, academy)` pair passes it as `expectedScope`,
 * and an inscription outside it is refused as one the screen does not hold;
 * the event-wide list passes nothing.
 *
 * Answers a success when the write went through, leaving each screen to decide
 * what follows (the detail redirects to itself, the list stays and toasts it);
 * a refusal otherwise, which keeps the dialog open with what the administrator
 * typed.
 */
export async function runSeminarInscriptionMoneyIntent(input: {
  eventId: string;
  expectedScope?: { academyId: string; seminarId: string };
  formData: FormData;
}): Promise<SeminarMoneyAnswer> {
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

  if (target === null || !isInScope(target, input.expectedScope)) {
    return { status: "error", message: "No encontramos esa inscripción." };
  }

  if (intent === releaseInscriptionExcessIntent) {
    const released = await releaseSeminarInscriptionExcess(target);

    return answer(intent, released);
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

  return answer(intent, result);
}

function isInScope(
  target: { academyId: string; seminarId: string },
  expectedScope: { academyId: string; seminarId: string } | undefined,
): boolean {
  return (
    expectedScope === undefined ||
    (target.academyId === expectedScope.academyId &&
      target.seminarId === expectedScope.seminarId)
  );
}

function answer(
  intent: string,
  result: { ok: true } | { ok: false; message: string },
): SeminarMoneyAnswer {
  return result.ok
    ? { status: "success", message: successMessages[intent] ?? "" }
    : { status: "error", message: result.message };
}
