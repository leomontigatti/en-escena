import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import {
  archiveAcademyProfessor,
  findAcademyProfessor,
  reactivateAcademyProfessor,
  updateAcademyProfessor,
  type UpdateProfessorInput,
} from "@/lib/portal/professors.server";
import {
  archiveProfessorIntent,
  professorNotFoundMessage,
  reactivateProfessorIntent,
  updateProfessorIntent,
} from "@/features/portal/professors/detail/shared";

export async function loadPortalProfessorDetail({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);
  const professor = await requireProfessor(academy.id, professorId);

  return {
    professor,
  };
}

export async function handlePortalProfessorDetailAction({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === archiveProfessorIntent) {
    await archiveAcademyProfessor(academy.id, professorId);
    return {
      status: "success" as const,
      message: notificationToasts["profesor-archivado"].message,
    };
  }

  if (intent === reactivateProfessorIntent) {
    await reactivateAcademyProfessor(academy.id, professorId);
    return {
      status: "success" as const,
      message: notificationToasts["profesor-reactivado"].message,
    };
  }

  if (intent !== "" && intent !== updateProfessorIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const result = await updateAcademyProfessor(academy.id, professorId, {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  return {
    status: "success" as const,
    message: notificationToasts["profesor-guardado"].message,
  };
}

function readProfessorId(params: { professorId?: string }) {
  if (!params.professorId) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return params.professorId;
}

async function requireProfessor(academyId: string, professorId: string) {
  const professor = await findAcademyProfessor(academyId, professorId);

  if (!professor) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return professor;
}

function readFormString(
  formData: FormData,
  key: keyof UpdateProfessorInput | "intent",
) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
