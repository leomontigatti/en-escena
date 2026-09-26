import { z } from "zod";

import type {
  AcademyMergeCandidate,
  AcademyMergeHoldings,
  mergeAcademyIntent,
} from "@/lib/academies/academy-merge.shared";
import type { AcademyProfileField } from "@/lib/academies/academy-profile.server";
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
});

export type AcademyDetailLoaderData = {
  academy: {
    contactName: string;
    email: string;
    id: string;
    name: string;
    phone: string;
  };
  canEdit: boolean;
  /** What the merge dialog offers; `null` for a read-only auditor. */
  merge: {
    candidates: AcademyMergeCandidate[];
    holdings: AcademyMergeHoldings;
  } | null;
  selectedEventId: string | null;
};

export type AcademyDetailFormValues = z.infer<typeof academyDetailSchema>;
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
