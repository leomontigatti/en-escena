import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { deleteEmptyAcademy } from "@/lib/academies/academy-deletion.server";
import {
  loadAcademyMergeOptions,
  mergeAcademies,
} from "@/lib/academies/academy-merge.server";
import { mergeAcademyIntent } from "@/lib/academies/academy-merge.shared";
import { updateAcademyProfile } from "@/lib/academies/academy-profile.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { readFormString } from "@/lib/shared/forms";
import { mergeSurvivorFieldName } from "@/lib/shared/merge";

import {
  academyDetailSchema,
  academySavedMessage,
  deleteAcademyIntent,
  updateAcademyIntent,
  type AcademyDetailActionData,
  type AcademyDetailLoaderData,
} from "./shared";

export async function loadAcademyDetail({
  params,
  request,
}: {
  params: { academyId?: string };
  request: Request;
}): Promise<AcademyDetailLoaderData> {
  const currentUser = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);
  const academy = await readAcademy(params.academyId);

  return {
    academy,
    canEdit: currentUser.role === "admin",
    merge:
      currentUser.role === "admin"
        ? await loadAcademyMergeOptions(academy.id)
        : null,
    selectedEventId: eventContext.selectedEventId,
  };
}

export async function handleAcademyDetailAction({
  params,
  request,
}: {
  params: { academyId?: string };
  request: Request;
}): Promise<AcademyDetailActionData> {
  await requireInternalUser(request, ["admin"]);
  const academy = await readAcademy(params.academyId);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === deleteAcademyIntent) {
    return await deleteAcademy({ academyId: academy.id, formData });
  }

  if (intent === mergeAcademyIntent) {
    return await mergeAcademy({ academyId: academy.id, formData });
  }

  if (intent !== "" && intent !== updateAcademyIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = {
    name: readFormString(formData, "name"),
    contactName: readFormString(formData, "contactName"),
    phone: readFormString(formData, "phone"),
  };
  const parsed = academyDetailSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      status: "error",
      intent: updateAcademyIntent,
      message:
        "No pudimos guardar los cambios. Revisá los datos e intentá de nuevo.",
      fieldErrors: {
        name: flattened.name?.[0],
        contactName: flattened.contactName?.[0],
        phone: flattened.phone?.[0],
      },
      values,
    };
  }

  const result = await updateAcademyProfile(academy.id, parsed.data);

  if (!result.ok) {
    return {
      status: "error",
      intent: updateAcademyIntent,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  return {
    status: "success",
    intent: updateAcademyIntent,
    message: academySavedMessage,
  };
}

/**
 * The panel's answer to a forked or abandoned signup: an academy that holds
 * nothing goes, and its user with it. A refusal stays on the detail as direct
 * action data, because the academy is still there to look at
 * (docs/agents/form-feedback.md); a delete redirects to the list, so its
 * message travels in the flash session.
 */
async function deleteAcademy({
  academyId,
  formData,
}: {
  academyId: string;
  formData: FormData;
}): Promise<AcademyDetailActionData | never> {
  if (
    readFormString(formData, "id") !== academyId ||
    readFormString(formData, "confirmDeletion") !== academyId
  ) {
    return {
      status: "error",
      intent: deleteAcademyIntent,
      message: "Confirmá la eliminación de la academia.",
    };
  }

  const result = await deleteEmptyAcademy(academyId);

  if (!result.ok) {
    return {
      status: "error",
      intent: deleteAcademyIntent,
      message: result.message,
    };
  }

  throw await redirectWithFlashNotification(
    "/administracion/academias",
    "academia-eliminada",
  );
}

/**
 * The panel's answer to an academy that forked with people or money in it.
 * The removed academy's page stops existing, so a merge redirects to the
 * survivor with a flash; a refusal returns to the dialog as action data.
 */
async function mergeAcademy({
  academyId,
  formData,
}: {
  academyId: string;
  formData: FormData;
}): Promise<AcademyDetailActionData | never> {
  if (readFormString(formData, "id") !== academyId) {
    return {
      status: "merge-refused",
      intent: mergeAcademyIntent,
      message: "Confirmá la fusión desde la ficha.",
    };
  }

  const result = await mergeAcademies({
    removedId: academyId,
    survivorId: readFormString(formData, mergeSurvivorFieldName),
  });

  if (!result.ok) {
    return {
      status: "merge-refused",
      intent: mergeAcademyIntent,
      message: result.message,
    };
  }

  throw await redirectWithFlashNotification(
    `/administracion/academias/${result.survivor.id}`,
    "academias-fusionadas",
  );
}

async function readAcademy(academyId?: string) {
  if (!academyId) {
    throw new Response("No encontramos esa Academia.", { status: 404 });
  }

  const [academy] = await db
    .select({
      contactName: academies.contactName,
      email: user.email,
      id: academies.id,
      name: academies.name,
      phone: academies.phone,
    })
    .from(academies)
    .innerJoin(user, eq(academies.userId, user.id))
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    throw new Response("No encontramos esa Academia.", { status: 404 });
  }

  return academy;
}
