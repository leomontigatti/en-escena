import { z } from "zod";

import type { AcademyProfileField } from "@/features/portal/profile/academy-profile.server";
import { argentinePhoneField } from "@/lib/shared/argentine-phone";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const profileFormId = "portal-perfil-form";
export const passwordRecoveryFormId = "portal-password-recovery-form";
export const updateAcademyProfileIntent = "update-academy-profile";
export const requestPasswordRecoveryIntent = "request-password-recovery";

export const academyProfileSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  contactName: z.string().trim().min(1, requiredFieldMessage),
  phone: argentinePhoneField(),
});

export type AcademyProfileFormValues = z.infer<typeof academyProfileSchema>;
export type AcademyProfileFieldErrors = Partial<
  Record<AcademyProfileField, string>
>;

export type PortalProfileActionData =
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: AcademyProfileFieldErrors;
      values: AcademyProfileFormValues;
    };
