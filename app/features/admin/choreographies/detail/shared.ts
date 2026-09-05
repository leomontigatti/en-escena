import type { FieldErrors } from "@/lib/shared/form-validation";
import { notificationToasts } from "@/lib/shared/notification-toasts";

export const renameChoreographyIntent = "rename-choreography";
export const deleteChoreographyIntent = "delete-choreography";
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

export type ChoreographyScheduleCapacityBlockerCode = "frozen-price";

/**
 * Why schedule-capacity reassignment is closed, with the same shape as the
 * deletion blockers: the server builds the `code` and the label that gets read,
 * and the view only lists it in the page's alert.
 */
export type ChoreographyScheduleCapacityBlocker = {
  code: ChoreographyScheduleCapacityBlockerCode;
  label: string;
};

/**
 * The three read-only causes for the schedule capacity: not being `admin`,
 * having a presentation, and having nothing to move to.
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
  hasPresentation: boolean;
  hasSelectableAlternative: boolean;
}) {
  return (
    input.canEdit && !input.hasPresentation && input.hasSelectableAlternative
  );
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
  hasPresentation: boolean;
  requiresExperienceLevel: boolean;
}) {
  return (
    input.canEdit && !input.hasPresentation && input.requiresExperienceLevel
  );
}

export type ChoreographyModalityBlockerCode = "frozen-price";

/**
 * Same shape as the capacity and deletion blockers: the server writes the code and
 * the label, and the view only enumerates it in the page alert.
 */
export type ChoreographyModalityBlocker = {
  code: ChoreographyModalityBlockerCode;
  label: string;
};

/**
 * Only two causes of read-only for the modality: not being `admin` and having
 * a presentation. A registered deposit deliberately does not close the field: a
 * destination modality that keeps the current schedule is financially inert,
 * so the money guard rejects at save and only when the correction would
 * actually move the capacity. It is reported as a blocker-in-waiting in the page
 * alert instead.
 */
export function canCorrectChoreographyModality(input: {
  canEdit: boolean;
  hasPresentation: boolean;
}) {
  return input.canEdit && !input.hasPresentation;
}

export type ChoreographyDeleteBlockerCode =
  | "comprobantes"
  | "presentation"
  | "scores";

export type ChoreographyDeleteBlocker = {
  code: ChoreographyDeleteBlockerCode;
  label: string;
};
