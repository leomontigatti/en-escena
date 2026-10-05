import { z } from "zod";

import type { AcademyProfileField } from "@/lib/academies/academy-profile.server";
import { provinceField } from "@/lib/academies/provinces";
import { argentinePhoneField } from "@/lib/shared/argentine-phone";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { contentTextField } from "@/lib/shared/text-content";

export const profileFormId = "portal-perfil-form";
export const passwordRecoveryFormId = "portal-password-recovery-form";
export const updateAcademyProfileIntent = "update-academy-profile";
export const requestPasswordRecoveryIntent = "request-password-recovery";

export const academyProfileSchema = z.object({
  // Shown read-only and never saved from here, so it is not held to the
  // content rule: an academy whose stored name fails it could not save the rest.
  name: z.string().trim().min(1, requiredFieldMessage),
  contactName: contentTextField(),
  phone: argentinePhoneField(),
  province: provinceField(),
  city: contentTextField(),
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
