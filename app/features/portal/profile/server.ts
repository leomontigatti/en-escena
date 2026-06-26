import { data, redirect } from "react-router";

import { updateAcademyProfile } from "@/features/portal/profile/academy-profile.server";
import { requestAccessRecoveryEmail } from "@/lib/auth/access-recovery.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  academyProfileSchema,
  requestPasswordRecoveryIntent,
  updateAcademyProfileIntent,
} from "@/features/portal/profile/shared";

export async function loadPortalProfile(request: Request) {
  const { user, academy } = await requireAcademyUser(request);

  return {
    email: user.email,
    academy,
  };
}

export async function handlePortalProfileAction(request: Request) {
  const { academy, user } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === requestPasswordRecoveryIntent) {
    const result = await requestAccessRecoveryEmail({
      email: user.email,
      requestUrl: request.url,
      request,
    });

    return data(
      {
        status: "success" as const,
        message: result.message,
      },
      {
        headers: result.headers,
      },
    );
  }

  if (intent !== "" && intent !== updateAcademyProfileIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = {
    name: readFormString(formData, "name"),
    contactName: readFormString(formData, "contactName"),
    phone: readFormString(formData, "phone"),
  };
  const parsed = academyProfileSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: {
        name: flattened.name?.[0],
        contactName: flattened.contactName?.[0],
        phone: flattened.phone?.[0],
      },
      values,
    };
  }

  const result = await updateAcademyProfile(academy.id, {
    ...parsed.data,
    name: academy.name,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  throw redirect("/portal/perfil?notificacion=perfil-guardado");
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}
