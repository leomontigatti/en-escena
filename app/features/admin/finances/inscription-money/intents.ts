import type { AllocationTargetKind } from "@/lib/finances/allocation-target.server";

// The three money gestures of an inscription, shared by the two financial
// details because they are the same gestures on the same pool. All of them name
// an inscription and an amount and never a payment: which payment the money
// comes from or goes back to is the pool rules' answer.
export const allocateInscriptionIntent = "allocate-inscription";
export const removeInscriptionMoneyIntent = "remove-inscription-money";
export const releaseInscriptionExcessIntent = "release-inscription-excess";

/**
 * The field that says which kind of inscription the dialog is about. It travels
 * in the form rather than being inferred from the route so that the one dialog
 * stays the one dialog: the seminar path passes `seminar`, the choreography path
 * `choreography`, and each action refuses the kind it does not own.
 */
export const targetKindFieldName = "targetKind";

/** The kind the form named, or `null` when it is not one of the two. */
export function readAllocationTargetKind(
  formData: FormData,
): AllocationTargetKind | null {
  const value = String(formData.get(targetKindFieldName) ?? "");

  return value === "choreography" || value === "seminar" ? value : null;
}

/** The typed amount, or `null` when it is not a positive whole number. */
export function readMoneyAmount(formData: FormData): number | null {
  const amount = Number(String(formData.get("amount") ?? "").trim());

  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

/**
 * The price chosen inside the dialog. `null` when the field is absent, which is
 * how a locked price arrives: the dialog shows it as a readout and submits
 * nothing, so the inscription keeps the row it already holds.
 */
export function readPickedPriceId(formData: FormData): string | null {
  const priceId = String(formData.get("priceId") ?? "").trim();

  return priceId === "" ? null : priceId;
}
