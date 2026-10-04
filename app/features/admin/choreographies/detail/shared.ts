import { notificationToasts } from "@/lib/shared/notification-toasts";

import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
} from "./draft.shared";

export const deleteChoreographyIntent = "delete-choreography";
export const restoreChoreographyIntent = "restore-choreography";

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
    message: notificationToasts["coreografia-guardada"].message,
    status: "success",
  };
}

/**
 * Restoring is the one thing a withdrawn choreography still accepts, and it is
 * an administrative correction: `admin` only, and only while the choreography is
 * actually withdrawn. The auditor sees the state and never undoes it.
 *
 * It is asked of the role and not of `canEdit`, which is false for the whole
 * page while the choreography is withdrawn — that is the point of the state.
 */
export function canRestoreChoreography(input: {
  isAdmin: boolean;
  isWithdrawn: boolean;
}) {
  return input.isAdmin && input.isWithdrawn;
}

// Restoring reports back in place, like every other correction on the detail:
// the choreography is still the page the admin is on, only no longer withdrawn.
export function choreographyRestoredSuccess(): ChoreographySuccessData {
  return {
    message: notificationToasts["coreografia-restaurada"].message,
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
// not a blocker (#340 reversed). The evaluated presentation is the only lock
// left, and it blocks the withdrawal too.
export type ChoreographyDeleteBlockerCode = "evaluated-presentation";

export type ChoreographyDeleteBlocker = {
  code: ChoreographyDeleteBlockerCode;
  label: string;
};

/**
 * Which of the two outcomes the removal will produce, as the loader read it.
 * It is advisory: the write re-decides under the choreography's row lock, so a
 * dialog that announced a delete can still end in a withdrawal.
 */
export type ChoreographyRemovalPreview = "deleted" | "withdrawn";

/**
 * What restoring does, said before the admin confirms: it is the withdrawal
 * undone, not a re-registration. The place in the schedule is the one thing that
 * may refuse it, and it is asked for again at the click, so the dialog announces
 * it as a condition rather than as a certainty.
 */
export const restoreChoreographyDescription =
  "Vuelve a la lista con las inscripciones que tenía al retirarse y ocupa de nuevo su cupo de cronograma. Los bailarines dados de baja antes del retiro siguen de baja.";

/**
 * The two outcomes are two dialogs, because they are not the same act: one
 * leaves nothing behind, the other keeps the choreography with its money
 * exactly where it was allocated, so it asks to withdraw rather than delete.
 *
 * An unevaluated presentation does not block either outcome — it is deleted
 * with the choreography — so the number is named as a consequence and not as a
 * reason to stop. The gap it leaves stays: every other number is what the
 * academies were told.
 */
export function describeChoreographyRemoval(input: {
  outcome: ChoreographyRemovalPreview;
  presentationOrderNumber: number | null;
}) {
  const ending =
    input.presentationOrderNumber === null
      ? "."
      : " y pierde el número de orden.";

  return input.outcome === "withdrawn"
    ? {
        consequence: `Al retirarla también libera su cupo del cronograma${ending}`,
        description:
          "Al tener dinero asignado o comprobantes emitidos, no puede eliminarse. Podés revisarla desde la lista de finanzas.",
        outcome: input.outcome,
        title: "¿Retirar la coreografía?",
      }
    : {
        description: `Al no tener dinero asignado ni comprobantes emitidos, se elimina por completo. Al eliminarla también libera su cupo del cronograma${ending}`,
        outcome: input.outcome,
        title: "¿Eliminar la coreografía?",
      };
}
