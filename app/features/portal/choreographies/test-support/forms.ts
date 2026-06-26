export function choreographyUpdateFormData(input: {
  dancerIds: string[];
  professorIds?: string[];
  experienceLevelId?: string;
  scheduleCapacityId?: string;
}) {
  const formData = new FormData();
  formData.set("intent", "update-choreography");

  for (const dancerId of input.dancerIds) {
    formData.append("dancerIds", dancerId);
  }

  for (const professorId of input.professorIds ?? []) {
    formData.append("professorIds", professorId);
  }

  if (input.experienceLevelId) {
    formData.set("experienceLevelId", input.experienceLevelId);
  }

  if (input.scheduleCapacityId) {
    formData.set("scheduleCapacityId", input.scheduleCapacityId);
  }

  return formData;
}

export function resolveDancerLinkFormData(dancerIds: string[]) {
  const formData = new FormData();
  formData.set("intent", "resolve-choreography-dancers");

  for (const dancerId of dancerIds) {
    formData.append("dancerIds", dancerId);
  }

  return formData;
}

export function dancerLinkFormData(
  dancerIds: string[],
  options: {
    experienceLevelId?: string;
    professorIds?: string[];
    scheduleCapacityId?: string;
  } = {},
) {
  const formData = new FormData();
  formData.set("intent", "update-choreography");

  for (const dancerId of dancerIds) {
    formData.append("dancerIds", dancerId);
  }

  for (const professorId of options.professorIds ?? []) {
    formData.append("professorIds", professorId);
  }

  if (options.experienceLevelId) {
    formData.set("experienceLevelId", options.experienceLevelId);
  }

  if (options.scheduleCapacityId) {
    formData.set("scheduleCapacityId", options.scheduleCapacityId);
  }

  return formData;
}

export function deleteChoreographyFormData(choreographyId: string) {
  const formData = new FormData();
  formData.set("intent", "delete-choreography");
  formData.set("confirmDeletion", choreographyId);

  return formData;
}
