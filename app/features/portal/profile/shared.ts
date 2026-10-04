import { z } from "zod";

import type { AcademyProfileField } from "@/lib/academies/academy-profile.server";
import { provinceField } from "@/lib/academies/provinces";
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
  city: z.string().trim().min(1, requiredFieldMessage),
  province: provinceField(),
});

/** As the form holds them: the province is text until one is picked. */
export type AcademyProfileFormValues = z.input<typeof academyProfileSchema>;
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
