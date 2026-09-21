import type { FieldErrors } from "@/lib/shared/form-validation";
import { notificationToasts } from "@/lib/shared/notification-toasts";

export const renameChoreographyIntent = "rename-choreography";
export const deleteChoreographyIntent = "delete-choreography";
export const restoreChoreographyIntent = "restore-choreography";
export const resolveChoreographyRosterIntent = "resolve-roster";
export const updateChoreographyRosterIntent = "update-roster";
export const updateChoreographySubmodalityIntent = "update-submodality";
export const updateChoreographyScheduleCapacityIntent =
  "update-schedule-capacity";
export const updateChoreographyExperienceLevelIntent =
  "update-experience-level";
export const resolveChoreographyModalityIntent = "resolve-modality";
export const updateChoreographyModalityIntent = "update-modality";

/**
 * The modality correction is a sibling form of the roster one, so its four
 * fields carry their own names: the roster form already registers
 * `experienceLevelId` and `scheduleCapacityId`, and two controls writing the
 * same DOM name would overwrite each other.
 */
export const modalityFieldNames = {
  experienceLevelId: "modalityExperienceLevelId",
  modalityId: "modalityId",
  previewedCategoryId: "modalityPreviewedCategoryId",
  scheduleCapacityId: "modalityScheduleCapacityId",
  submodalityId: "modalitySubmodalityId",
} as const;

/**
 * The standalone schedule select lives inside the roster's `form`, which
 * already registers `scheduleCapacityId`. A name of its own keeps the two
 * fields from colliding in the DOM and makes it clear which of the two is
 * rendered.
 */
export const assignedScheduleCapacityFieldName = "assignedScheduleCapacityId";

/**
 * Same reason as the capacity: the roster's `form` already registers
 * `experienceLevelId`, so the standalone select uses a name of its own to avoid
 * colliding with it in the DOM.
 */
export const assignedExperienceLevelFieldName = "assignedExperienceLevelId";

/**
 * `resolve-roster` only asks how the choreography would look with a tentative
 * roster: it persists nothing. Revalidating after that query reloads the loader
 * and resets the form to the saved roster, clobbering the edit in progress.
 *
 * `resolve-modality` previews a candidate modality the same way, and is
 * excluded for the same reason.
 */
export function shouldRevalidateChoreographyDetail(input: {
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  const intent = input.formData?.get("intent");

  if (
    intent === resolveChoreographyRosterIntent ||
    intent === resolveChoreographyModalityIntent
  ) {
    return false;
  }

  return input.defaultShouldRevalidate;
}

export const choreographyFieldNames = ["name"] as const;

export type ChoreographyFieldName = (typeof choreographyFieldNames)[number];

export type ChoreographyActionData = {
  fieldErrors?: FieldErrors<ChoreographyFieldName>;
  message: string;
  status: "error";
  values: {
    name: string;
  };
};

/**
 * The single-field intents (submodality, schedule capacity) report back without
 * per-field errors: the select returns to its saved value and the reason
 * arrives by toast.
 */
export type ChoreographyFieldUpdateErrorData = {
  message: string;
  status: "error";
};

export type ChoreographySuccessData = {
  message: string;
  status: "success";
};

// In-place editing on the detail does not redirect: it returns
// `{ status: "success" }`, the loader revalidates and the view fires the toast
// directly. See docs/agents/form-feedback.md.
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
 */
export function canRestoreChoreography(input: {
  canEdit: boolean;
  isWithdrawn: boolean;
}) {
  return input.canEdit && input.isWithdrawn;
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
  | ChoreographyActionData
  | ChoreographyFieldUpdateErrorData
  | ChoreographySuccessData;

export type ChoreographyRosterErrorData = {
  fieldErrors?: {
    experienceLevelId?: string;
    scheduleCapacityId?: string;
  };
  message: string;
  section: "dancers" | "professors";
  status: "roster-error";
};

/**
 * The route only forwards results with status `error` or `success` to the view.
 * A bespoke status — such as the `roster-error` the roster section reads
 * separately — is dropped silently, so a new intent that wants its rejection to
 * be seen has to return `error`.
 */
export function toChoreographyDetailViewActionData(
  actionData?:
    | ChoreographyRosterErrorData
    | ChoreographyViewActionData
    | Response
    | { intent: string },
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

/**
 * The three read-only causes for the schedule capacity: not being `admin`,
 * being evaluated, and having nothing to move to.
 *
 * Money is not one of them. It is no longer a property of the choreography but
 * of each destination —an alternative that would reprice an inscription is
 * omitted from the options— so the question "is there somewhere to move to" is
 * answered once, off the surviving alternatives, and the blockers stay what
 * they are: the explanation the page's alert reads out. ANDing the two routes
 * would ask the same thing twice by different paths, and they can disagree: a
 * choreography holding money whose alternatives all hold the price would render
 * closed with a select full of valid destinations.
 */
export function canReassignScheduleCapacity(input: {
  canEdit: boolean;
  isEvaluated: boolean;
  hasSelectableAlternative: boolean;
}) {
  return input.canEdit && !input.isEvaluated && input.hasSelectableAlternative;
}

/**
 * The experience level is not a price key, so it does not carry blockers from
 * the server the way the capacity does: the three read-only causes are enough.
 * The underlying condition is a single one — that the resolved category declares
 * levels — plus the choreography's two cross-cutting locks. There is no
 * threshold on the number of options: with a single option the field stays open,
 * because that is the only way to resolve a missing level that leaves the
 * choreography incomplete.
 */
export function canReassignExperienceLevel(input: {
  canEdit: boolean;
  isEvaluated: boolean;
  requiresExperienceLevel: boolean;
}) {
  return input.canEdit && !input.isEvaluated && input.requiresExperienceLevel;
}

export type ChoreographyModalityBlockerCode = "price-change";

/**
 * Same shape as the capacity and deletion blockers: the server writes the code and
 * the label, and the view only enumerates it in the page alert.
 */
export type ChoreographyModalityBlocker = {
  code: ChoreographyModalityBlockerCode;
  label: string;
};

/**
 * Only two causes of read-only for the modality: not being `admin` and being
 * evaluated. A registered deposit deliberately does not close the field: a
 * destination modality that keeps the current schedule is financially inert,
 * so the money guard rejects at save and only when the correction would
 * actually move the capacity. It is reported as a blocker-in-waiting in the page
 * alert instead.
 */
export function canCorrectChoreographyModality(input: {
  canEdit: boolean;
  isEvaluated: boolean;
}) {
  return input.canEdit && !input.isEvaluated;
}

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
 * The dialog names the outcome before the admin confirms, because the two are
 * not the same act: one leaves nothing behind, the other keeps the choreography
 * with its money exactly where it was allocated.
 *
 * An unevaluated presentation does not block either outcome — it is deleted
 * with the choreography — so the number is named as a consequence and not as a
 * reason to stop. The gap it leaves stays: every other number is what the
 * academies were told.
 */
export function formatChoreographyRemovalDescription(input: {
  outcome: ChoreographyRemovalPreview;
  presentationOrderNumber: number | null;
}) {
  const base =
    input.outcome === "withdrawn"
      ? "Tiene dinero asignado o comprobantes emitidos, así que no se elimina: queda retirada. No se mueve dinero y libera el cupo de cronograma."
      : "No tiene dinero asignado ni comprobantes, así que se elimina por completo y no queda nada. Libera el cupo de cronograma.";

  if (input.presentationOrderNumber === null) {
    return base;
  }

  return `${base} Tiene la presentación n.º ${input.presentationOrderNumber}; se quitará del orden.`;
}
