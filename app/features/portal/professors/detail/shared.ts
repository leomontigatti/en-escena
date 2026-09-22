import { z } from "zod";

import type { PortalProfessorListItem } from "@/lib/portal/professors.server";
import {
  getArchiveKeepsRosterMessage,
  getRosterPersonParticipatingMessage,
} from "@/lib/roster/roster-person-status.shared";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const updateProfessorIntent = "update-professor";
export const archiveProfessorIntent = "archive-professor";
export const reactivateProfessorIntent = "reactivate-professor";
export const portalProfessorNotFoundMessage = "No encontramos ese Profesor.";
export const professorDetailFormId = "portal-profesor-form";

export const professorSchema = z
  .object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    documentType: z.string().trim(),
    documentNumber: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (!values.documentType && !values.documentNumber) {
      return;
    }

    if (!values.documentType) {
      context.addIssue({
        code: "custom",
        message: "Seleccioná el tipo de documento.",
        path: ["documentType"],
      });
    }

    if (!values.documentNumber) {
      context.addIssue({
        code: "custom",
        message: "Ingresá el número de documento.",
        path: ["documentNumber"],
      });
    }
  });

export type ProfessorFormValues = z.infer<typeof professorSchema>;
export type PortalProfessorFieldErrors = Partial<
  Record<keyof ProfessorFormValues, string>
>;
export type ProfessorStatusIntent =
  typeof archiveProfessorIntent | typeof reactivateProfessorIntent;

export type PortalProfessorDetailLoaderData = {
  /**
   * Answered by `findActiveEventParticipation`, the same reader the guard in
   * `setRosterPersonStatus` asks — see the dancer twin. It is the whole event
   * context this screen needs: the reader resolves the active event itself, so
   * the loader stays free of a selected event it shows nothing of.
   */
  isParticipatingInActiveEvent: boolean;
  professor: PortalProfessorListItem;
};

type PortalProfessorStatusActionCopy = {
  intent: ProfessorStatusIntent;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonLabel: string;
  confirmButtonVariant: "default" | "destructive";
};

export type PortalProfessorStatusAction = PortalProfessorStatusActionCopy & {
  /**
   * A courtesy in front of the guard, never the rule: the server refuses the
   * archive whether or not this is honoured. Reactivating is never refused, so
   * only the archive intent is ever disabled.
   */
  disabled: boolean;
};

export const portalProfessorStatusActions = {
  [archiveProfessorIntent]: {
    intent: archiveProfessorIntent,
    label: "Archivar",
    confirmTitle: "¿Archivar profesor?",
    confirmDescription: `El profesor dejará de aparecer en listas activas y en próximas selecciones de coreografías. ${getArchiveKeepsRosterMessage("professor")}`,
    confirmButtonLabel: "Archivar",
    confirmButtonVariant: "destructive",
  },
  [reactivateProfessorIntent]: {
    intent: reactivateProfessorIntent,
    label: "Reactivar",
    confirmTitle: "¿Reactivar profesor?",
    confirmDescription:
      "El profesor volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Reactivar",
    confirmButtonVariant: "default",
  },
} as const satisfies Record<
  ProfessorStatusIntent,
  PortalProfessorStatusActionCopy
>;

export type PortalProfessorDetailViewModel = {
  /**
   * Why the archive action is unavailable, or `null` when it is available.
   * Informational: nothing is wrong when it shows.
   */
  participatingAlert: string | null;
  statusAction: PortalProfessorStatusAction;
};

/**
 * The status half of the screen's view model: which action the header offers,
 * whether it is available, and the sentence that explains an unavailable one.
 * The dancer twin is `buildPortalDancerDetailViewModel`, and the panel twin is
 * `buildProfessorDetailViewState`.
 */
export function buildPortalProfessorDetailViewModel({
  active,
  isParticipatingInActiveEvent,
}: {
  active: boolean;
  isParticipatingInActiveEvent: boolean;
}): PortalProfessorDetailViewModel {
  const statusAction: PortalProfessorStatusAction = active
    ? {
        ...portalProfessorStatusActions[archiveProfessorIntent],
        disabled: isParticipatingInActiveEvent,
      }
    : {
        ...portalProfessorStatusActions[reactivateProfessorIntent],
        disabled: false,
      };

  return {
    // Only beside a disabled archive: an archived participant is offered
    // `Reactivar`, which this rule never refuses.
    participatingAlert: statusAction.disabled
      ? getRosterPersonParticipatingMessage("professor")
      : null,
    statusAction,
  };
}

export type PortalProfessorDetailActionData =
  | {
      status: "error";
      message: string;
      fieldErrors: PortalProfessorFieldErrors;
      // Absent when the failure was not a rejected edit: a refused archive has
      // no form to repopulate.
      values?: ProfessorFormValues;
    }
  | {
      status: "success";
      message: string;
    }
  | undefined;
