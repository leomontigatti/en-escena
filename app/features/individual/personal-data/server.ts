import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import {
  parseIndividualPersonalData,
  readIndividualPersonalDataValues,
  type IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import { updateIndividualPersonalData } from "@/lib/individuals/personal-data.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";

import type { IndividualPersonalDataActionData } from "./shared";

export async function loadIndividualPersonalData(request: Request) {
  const { user, individual } = await requireIndividualUser(request);

  return {
    email: user.email,
    values: {
      firstName: individual.firstName,
      lastName: individual.lastName,
      documentType: individual.documentType,
      documentNumber: individual.documentNumber,
      phone: individual.phone,
    } satisfies IndividualPersonalDataValues,
  };
}

export async function handleIndividualPersonalDataAction(
  request: Request,
): Promise<IndividualPersonalDataActionData> {
  const { individual } = await requireIndividualUser(request);
  const values = readIndividualPersonalDataValues(await request.formData());
  const parsed = parseIndividualPersonalData(values);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revisá los datos del formulario.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  await updateIndividualPersonalData(individual, parsed.data);

  return {
    status: "success",
    message: notificationToasts["personal-data-saved"].message,
  };
}
