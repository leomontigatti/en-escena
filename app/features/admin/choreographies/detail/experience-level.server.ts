import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { invalidExperienceLevelMessage } from "@/lib/choreographies/choreography-messages";
import { validateExperienceLevelSelection } from "@/lib/choreographies/registration-resolution.server";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";

import type { ChoreographyDetail } from "./server";
import {
  assignedExperienceLevelFieldName,
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographySuccessData,
} from "./shared";

export type ChoreographyExperienceLevelOption = {
  id: string;
  name: string;
};

/**
 * Las opciones que la vista ofrece son exactamente las que el intent acepta:
 * los niveles que declara la categoría resuelta, más el nivel asignado hoy. Ese
 * agregado es solo de visibilidad —si la categoría dejó de admitir el nivel
 * guardado, tiene que seguir a la vista en lugar de desaparecer del select sin
 * explicación—, y reelegirlo es una escritura idéntica a lo que ya hay.
 *
 * No hay tabla de niveles: son un enum global y la categoría declara cuáles
 * admite, así que la lista se arma acá y no se consulta.
 */
export function resolveChoreographyExperienceLevelOptions(input: {
  categoryExperienceLevels: string[] | null;
  experienceLevelId: string | null;
}): ChoreographyExperienceLevelOption[] {
  const options = (input.categoryExperienceLevels ?? []).map((level) => ({
    id: level,
    name: experienceLevelLabels[level] ?? level,
  }));

  if (
    input.experienceLevelId !== null &&
    !options.some((option) => option.id === input.experienceLevelId)
  ) {
    options.push({
      id: input.experienceLevelId,
      name:
        experienceLevelLabels[input.experienceLevelId] ??
        input.experienceLevelId,
    });
  }

  return options;
}

export async function updateChoreographyExperienceLevel(input: {
  choreography: ChoreographyDetail;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // Mismo bloqueo duro que el roster, la submodalidad y el cupo: con
  // presentación el nivel no se toca, aunque el form mande uno.
  if (input.choreography.hasPresentation) {
    return {
      message:
        "No se puede cambiar el nivel de experiencia: la coreografía ya tiene presentación.",
      status: "error",
    };
  }

  // La misma condición que cierra el campo en el loader, revalidada contra la
  // categoría que la coreografía tiene guardada. Sin ella el intent acepta un
  // nivel que la vista se niega a ofrecer: con una categoría que no declara
  // niveles, un POST armado a mano escribiría igual una columna que el resto
  // del dominio da por nula.
  if (!input.choreography.requiresExperienceLevel) {
    return {
      message:
        "No se puede cambiar el nivel de experiencia: la categoría de esta coreografía no lo requiere.",
      status: "error",
    };
  }

  const requestedExperienceLevelId = readRequestedExperienceLevelId(
    input.formData,
  );
  const validation = validateExperienceLevelSelection({
    availableExperienceLevels: input.choreography.experienceLevelOptions,
    experienceLevelId: requestedExperienceLevelId,
  });

  if (!validation.ok) {
    return {
      message: validation.failure.error,
      status: "error",
    };
  }

  // La validación ya garantizó la pertenencia a las opciones de la categoría;
  // este guard es lo que le prueba al tipo de la columna que el string es un
  // valor del enum.
  if (
    requestedExperienceLevelId === null ||
    !isExperienceLevel(requestedExperienceLevelId)
  ) {
    return {
      message: invalidExperienceLevelMessage,
      status: "error",
    };
  }

  await db
    .update(choreographies)
    .set({
      experienceLevelId: requestedExperienceLevelId,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreography.id));

  return choreographySavedSuccess();
}

function readRequestedExperienceLevelId(formData: FormData) {
  const value = formData.get(assignedExperienceLevelFieldName);

  return typeof value === "string" && value.length > 0 ? value : null;
}
