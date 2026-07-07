const documentTypeEmptyLabel = "Sin documento";

const documentTypeOptions = [
  { value: "dni", label: "DNI" },
  { value: "passport", label: "Pasaporte" },
  { value: "other", label: "Otro" },
] as const;

export { documentTypeEmptyLabel, documentTypeOptions };
