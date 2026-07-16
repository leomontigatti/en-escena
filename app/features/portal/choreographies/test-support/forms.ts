export function musicUpdateFormData(
  input: {
    musicStorageKey?: string;
    dancerIds?: string[];
    professorIds?: string[];
  } = {},
) {
  const formData = new FormData();
  formData.set("intent", "update-choreography");

  if (input.musicStorageKey !== undefined) {
    formData.set("musicStorageKey", input.musicStorageKey);
  }

  for (const dancerId of input.dancerIds ?? []) {
    formData.append("dancerIds", dancerId);
  }

  for (const professorId of input.professorIds ?? []) {
    formData.append("professorIds", professorId);
  }

  return formData;
}

export function deleteChoreographyFormData(choreographyId: string) {
  const formData = new FormData();
  formData.set("intent", "delete-choreography");
  formData.set("confirmDeletion", choreographyId);

  return formData;
}
