import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { updateAcademyProfile } from "@/lib/academies/academy-profile.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";

import {
  academyDetailSchema,
  updateAcademyIntent,
  type AcademyDetailActionData,
} from "./shared";

export async function loadAdministrativeAcademyDetail({
  params,
  request,
}: {
  params: { academyId?: string };
  request: Request;
}) {
  const currentUser = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const academy = await readAcademy(params.academyId);

  return {
    academy,
    canEdit: currentUser.role === "admin",
    selectedEventId: eventContext.selectedEventId,
  };
}

export async function handleAdministrativeAcademyDetailAction({
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
      message: "Revisá los campos marcados.",
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
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  return {
    status: "success",
    message: notificationToasts["academia-guardada"].message,
  };
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

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export type AcademyDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeAcademyDetail>
>;
