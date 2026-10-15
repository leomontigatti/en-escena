import { redirect } from "react-router";

import { requirePendingOnboardingUser } from "@/lib/auth/pending-onboarding.server";
import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";
import { completeIndividualOnboarding } from "@/lib/individuals/onboarding.server";
import { readIndividualPersonalDataValues } from "@/lib/individuals/personal-data";

import type { IndividualOnboardingActionData } from "./shared";

const oneAccountPerEmailMessage =
  "Este correo ya tiene una cuenta en En Escena, y cada correo es una sola cuenta. Para abrir una cuenta de particular, registrate con otro correo.";

/** The kind choice and the individual's form admit the same pending user. */
export async function loadPendingOnboarding(request: Request) {
  await requirePendingOnboardingUser(request);

  return null;
}

/** Opens the account and lands it in `/particular`, or says why not. */
export async function handleIndividualOnboardingAction(
  request: Request,
): Promise<IndividualOnboardingActionData> {
  const values = readIndividualPersonalDataValues(await request.formData());
  const result = await completeIndividualOnboarding({ request, values });

  if (result.ok) {
    throw redirect(INDIVIDUAL_AREA_PATH, { headers: result.headers });
  }

  return {
    status: "error",
    message:
      result.reason === "invalid"
        ? "Revisá los datos del formulario."
        : oneAccountPerEmailMessage,
    values,
  };
}
