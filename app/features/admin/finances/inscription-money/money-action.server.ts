import type { AllocationTargetKind } from "@/lib/finances/allocation-target.server";
import {
  allocateToInscription,
  releaseInscriptionExcess,
  releaseRetainedInscriptionDeposit,
  removeFromInscription,
  resolveInscriptionMoneyScope,
  type ExpectedInscriptionMoneyScope,
  type InscriptionMoneyScope,
  type MoneyResult,
} from "@/lib/finances/inscription-money.server";

import {
  allocateInscriptionIntent,
  isInscriptionMoneyIntent,
  readAllocationTargetKind,
  readMoneyAmount,
  readPickedPriceId,
  releaseInscriptionExcessIntent,
  releaseRetainedDepositIntent,
  removeInscriptionMoneyIntent,
  type InscriptionMoneyIntent,
} from "./intents";

/** What a money gesture answers: a refusal keeps the dialog open; a success
 * is for the screen that stays put to read out. */
export type InscriptionMoneyAnswer =
  { message: string; status: "error" } | { message: string; status: "success" };

const successMessages = {
  [allocateInscriptionIntent]: "Dinero asignado.",
  [releaseInscriptionExcessIntent]: "Excedente liberado.",
  [releaseRetainedDepositIntent]: "Seña liberada.",
  [removeInscriptionMoneyIntent]: "Dinero quitado.",
} satisfies Record<InscriptionMoneyIntent, string>;

/**
 * Turns the money dialog's form into a gesture, for every screen that mounts the
 * dialog: the choreography detail, the `(seminar, academy)` detail and the
 * event-wide seminar inscriptions list. The form names the inscription and
 * nothing else; its academy and its parent are read off it.
 *
 * The route says which `kind` it owns. A screen about one unit passes it as
 * `expectedScope`, and an inscription outside it is refused as one the screen
 * does not hold; the event-wide list passes nothing.
 *
 * Answers a success when the write went through, leaving each screen to decide
 * what follows (the details redirect to themselves, the list stays and toasts
 * it); a refusal otherwise, which keeps the dialog open with what the
 * administrator typed.
 */
export async function runInscriptionMoneyIntent(input: {
  eventId: string;
  expectedScope?: ExpectedInscriptionMoneyScope;
  formData: FormData;
  kind: AllocationTargetKind;
}): Promise<InscriptionMoneyAnswer> {
  const intent = String(input.formData.get("intent") ?? "");

  // The shared dialog carries the kind it is about, and a route owns one of
  // them: a target of the other kind reaching here is a form pointed at the
  // wrong screen, not an inscription that went missing.
  if (
    !isInscriptionMoneyIntent(intent) ||
    readAllocationTargetKind(input.formData) !== input.kind
  ) {
    return { status: "error", message: "No pudimos procesar esa acción." };
  }

  const inscriptionId = String(
    input.formData.get("inscriptionId") ?? "",
  ).trim();
  const scope = inscriptionId
    ? await resolveInscriptionMoneyScope({
        eventId: input.eventId,
        expectedScope: input.expectedScope,
        target: { id: inscriptionId, kind: input.kind },
      })
    : null;

  if (scope === null) {
    return { status: "error", message: "No encontramos esa inscripción." };
  }

  if (intent === releaseInscriptionExcessIntent) {
    return answer(intent, await releaseInscriptionExcess(scope));
  }

  if (intent === releaseRetainedDepositIntent) {
    return answer(intent, await releaseRetainedInscriptionDeposit(scope));
  }

  const amount = readMoneyAmount(input.formData);

  if (amount === null) {
    return { status: "error", message: "Ingresá un monto mayor a 0." };
  }

  return answer(
    intent,
    await runAmountGesture(intent, scope, amount, input.formData),
  );
}

function runAmountGesture(
  intent:
    typeof allocateInscriptionIntent | typeof removeInscriptionMoneyIntent,
  scope: InscriptionMoneyScope,
  amount: number,
  formData: FormData,
): Promise<MoneyResult> {
  return intent === allocateInscriptionIntent
    ? allocateToInscription({
        ...scope,
        amount,
        now: new Date(),
        priceId: readPickedPriceId(formData),
      })
    : removeFromInscription({ ...scope, amount });
}

function answer(
  intent: InscriptionMoneyIntent,
  result: MoneyResult,
): InscriptionMoneyAnswer {
  return result.ok
    ? { status: "success", message: successMessages[intent] }
    : { status: "error", message: result.message };
}
