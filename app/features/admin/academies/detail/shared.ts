import { z } from "zod";

import type { AcademyProfileField } from "@/lib/academies/academy-profile.server";
import { argentinePhoneField } from "@/lib/shared/argentine-phone";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const academyDetailFormId = "administracion-academia-detalle-form";
export const updateAcademyIntent = "update-academy";
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
  selectedEventId: string | null;
};

export type AcademyDetailFormValues = z.infer<typeof academyDetailSchema>;
export type AcademyDetailFieldErrors = Partial<
  Record<AcademyProfileField, string>
>;

export type AcademyDetailActionData =
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: AcademyDetailFieldErrors;
      values: AcademyDetailFormValues;
    };
