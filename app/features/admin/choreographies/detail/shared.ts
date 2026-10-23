import { notificationToasts } from "@/lib/shared/notification-toasts";

import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
} from "./draft.shared";

export const deleteChoreographyIntent = "delete-choreography";

/**
 * `resolve-draft` only asks what the draft would make of the choreography: it
 * persists nothing. Revalidating after it reloads the loader and starts the
 * form over from what is saved, clobbering the edit in progress.
 */
export function shouldRevalidateChoreographyDetail(input: {
  actionResult?: unknown;
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  const intent = input.formData?.get("intent");

  // A refused save wrote nothing, and reloading would start the draft over
  // from what is saved: the administrator keeps what they drafted instead.
  if (intent === saveChoreographyDraftIntent && isRefusal(input.actionResult)) {
    return false;
  }

  if (intent === resolveChoreographyDraftIntent) {
    return false;
  }

  return input.defaultShouldRevalidate;
}

function isRefusal(actionResult: unknown) {
  return (
    typeof actionResult === "object" &&
    actionResult !== null &&
    "status" in actionResult &&
    actionResult.status === "error"
  );
}

/**
 * A refusal reports back without per-field errors: the draft stays on screen
 * and the reason arrives by toast.
 */
export type ChoreographyFieldUpdateErrorData = {
  message: string;
  status: "error";
};

export type ChoreographySuccessData = {
  message: string;
  status: "success";
};

// Saving the detail does not redirect: it returns `{ status: "success" }`, the
// loader revalidates and the view fires the toast directly. See
// docs/agents/form-feedback.md.
export function choreographySavedSuccess(): ChoreographySuccessData {
  return {
    message: notificationToasts["choreography-saved"].message,
    status: "success",
  };
}

export type ChoreographyViewActionData =
  ChoreographyFieldUpdateErrorData | ChoreographySuccessData;

/**
 * The route only forwards results with status `error` or `success` to the view:
 * a preview's answer goes to its fetcher, and a redirect has left the page.
 */
export function toChoreographyDetailViewActionData(
  actionData?: ChoreographyViewActionData | Response | { intent: string },
): ChoreographyViewActionData | undefined {
  if (!actionData || actionData instanceof Response) {
    return undefined;
  }

  if (!("status" in actionData)) {
    return undefined;
  }

  return actionData.status === "error" || actionData.status === "success"
    ? actionData
    : undefined;
}

/**
 * The two things the price filter can have done to the alternatives: omitted
 * some of them, or omitted all of them and left the field read-only. Which one
 * is read off the options that survived, never off a blanket money read: money
 * that no destination would reprice is not a reason for an alert.
 */
export type ChoreographyScheduleCapacityBlockerCode =
  "no-price-preserving-option" | "price-filtered-options";

/**
 * What the price did to the schedule-capacity reassignment — narrow it or close
 * it — with the same shape as the deletion blockers: the server builds the
 * `code` and the label that gets read, and the view only lists it in the page's
 * alert.
 */
export type ChoreographyScheduleCapacityBlocker = {
  code: ChoreographyScheduleCapacityBlockerCode;
  label: string;
};

export type ChoreographyModalityBlockerCode = "price-change";

/**
 * Same shape as the capacity and deletion blockers: the server writes the code
 * and the label, and the view only enumerates it in the page alert.
 */
export type ChoreographyModalityBlocker = {
  code: ChoreographyModalityBlockerCode;
  label: string;
};

// A comprobante no longer refuses the removal — it is a reason to withdraw,
// not a blocker (#340 reversed). The evaluated presentation blocks both
// outcomes, and a withdrawn choreography has none left: its withdrawal is
// final (#1496).
export type ChoreographyDeleteBlockerCode =
  "evaluated-presentation" | "withdrawn";

export type ChoreographyDeleteBlocker = {
  code: ChoreographyDeleteBlockerCode;
  label: string;
};

/**
 * What the blocked `Eliminar` says, by the one blocker that applies: the two
 * never meet, because a withdrawal deletes the presentation an evaluation
 * would need. Each has a single reason, so it is a sentence rather than a
 * one-item list repeating the title.
 */
export const choreographyDeleteBlockedCopy: Record<
  ChoreographyDeleteBlockerCode,
  { description: string; reason: string; reasonsTitle: string }
> = {
  "evaluated-presentation": {
    description:
      "Una coreografía con la presentación evaluada no se puede eliminar ni retirar.",
    reason: "La evaluación no se puede anular.",
    reasonsTitle: "La presentación ya fue evaluada",
  },
  withdrawn: {
    description: "Una coreografía retirada no se puede eliminar.",
    reason:
      "El retiro es definitivo: para que vuelva a participar, registrá una coreografía nueva.",
    reasonsTitle: "La coreografía está retirada",
  },
};

/**
 * Which of the two outcomes the removal will produce, as the loader read it.
 * It is advisory: the write re-decides under the choreography's row lock, so a
 * dialog that announced a delete can still end in a withdrawal.
 */
export type ChoreographyRemovalPreview = "deleted" | "withdrawn";

/**
 * The two outcomes are two dialogs, because they are not the same act: one
 * leaves nothing behind, the other keeps the choreography with its money
 * exactly where it was allocated, so it asks to withdraw rather than delete.
 *
 * An unevaluated presentation does not block either outcome, so the number is
 * named as a consequence and not as a reason to stop. A deletion takes the
 * presentation with it and leaves a gap; a withdrawal keeps it at its number,
 * marked `Retirada`. Either way every other number is what the academies were
 * told.
 */
export function describeChoreographyRemoval(input: {
  outcome: ChoreographyRemovalPreview;
  presentationOrderNumber: number | null;
}) {
  const deletionEnding =
    input.presentationOrderNumber === null
      ? "."
      : " y pierde el número de orden.";
  const withdrawalEnding =
    input.presentationOrderNumber === null
      ? "."
      : ` y conserva el N.º ${input.presentationOrderNumber}, marcada como retirada.`;

  return input.outcome === "withdrawn"
    ? {
        // A withdrawal is final (#1496), so the dialog says so before the
        // admin confirms it.
        consequence: `Cada inscripción conserva su seña y lo que tenga por encima vuelve al saldo disponible de la academia. Al retirarla también libera su cupo del cronograma${withdrawalEnding} El retiro es definitivo: para que vuelva a participar hay que registrar una coreografía nueva.`,
        description:
          "Al tener dinero asignado o comprobantes emitidos, no puede eliminarse. Podés revisarla desde la lista de finanzas.",
        outcome: input.outcome,
        title: "¿Retirar la coreografía?",
      }
    : {
        description: `Al no tener dinero asignado ni comprobantes emitidos, se elimina por completo. Al eliminarla también libera su cupo del cronograma${deletionEnding}`,
        outcome: input.outcome,
        title: "¿Eliminar la coreografía?",
      };
}
