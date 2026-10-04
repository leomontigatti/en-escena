import { z } from "zod";

import type {
  AcademyMergeCandidate,
  AcademyMergeHoldings,
  mergeAcademyIntent,
} from "@/lib/academies/academy-merge.shared";
import type { AcademyProfileField } from "@/lib/academies/academy-profile.server";
import { provinceField } from "@/lib/academies/provinces";
import type { MergeRefusedActionData } from "@/lib/shared/merge";
import { argentinePhoneField } from "@/lib/shared/argentine-phone";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const academyDetailFormId = "administracion-academia-detalle-form";
export const updateAcademyIntent = "update-academy";
export const deleteAcademyIntent = "delete-academy";
export const academySavedMessage = "Academia guardada.";

export const academyDetailSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  contactName: z.string().trim().min(1, requiredFieldMessage),
  phone: argentinePhoneField(),
  province: provinceField(),
  city: z.string().trim().min(1, requiredFieldMessage),
});

export type AcademyDetailLoaderData = {
  academy: {
    /** Empty for an academy registered before the location fields existed. */
    city: string;
    contactName: string;
    email: string;
    id: string;
    name: string;
    phone: string;
    province: string;
  };
  canEdit: boolean;
  /**
   * What keeps the academy from being deleted, as the delete refusal lists it
   * (`2 bailarines`). Empty when it can be deleted, and for an auditor.
   */
  deletionHoldings: string[];
  /** What the merge dialog offers; `null` for a read-only auditor. */
  merge: {
    candidates: AcademyMergeCandidate[];
    holdings: AcademyMergeHoldings;
  } | null;
  selectedEventId: string | null;
};

/** As the form holds them: the province is text until one is picked. */
export type AcademyDetailFormValues = z.input<typeof academyDetailSchema>;
export type AcademyDetailFieldErrors = Partial<
  Record<AcademyProfileField, string>
>;

export type AcademyDetailActionData =
  | {
      status: "success";
      intent: typeof updateAcademyIntent;
      message: string;
    }
  | {
      status: "error";
      intent: typeof updateAcademyIntent;
      message: string;
      fieldErrors: AcademyDetailFieldErrors;
      values: AcademyDetailFormValues;
    }
  | {
      status: "error";
      intent: typeof deleteAcademyIntent;
      message: string;
    }
  | (MergeRefusedActionData & { intent: typeof mergeAcademyIntent });
