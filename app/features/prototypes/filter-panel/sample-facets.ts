import type { FilterFieldDefinition } from "./filter-schema";

/**
 * The choreographies list facets, at the size a real event produces. Categories
 * are the unbounded one — they come from the event configuration — and they are
 * what makes the current single dropdown scroll. The prototypes are only worth
 * comparing at this size.
 */

const dayOptions = [
  { label: "1 de mayo de 2026", value: "2026-05-01" },
  { label: "2 de mayo de 2026", value: "2026-05-02" },
  { label: "3 de mayo de 2026", value: "2026-05-03" },
  { label: "Sin asignar", value: "sin-asignar" },
];

const statusOptions = [
  { label: "Completa", value: "completa" },
  { label: "Incompleta", value: "incompleta" },
];

const modalityOptions = [
  { label: "Clásico", value: "clasico" },
  { label: "Comedia musical", value: "comedia-musical" },
  { label: "Contemporáneo", value: "contemporaneo" },
  { label: "Danzas árabes", value: "danzas-arabes" },
  { label: "Español", value: "espanol" },
  { label: "Folklore", value: "folklore" },
  { label: "Hip hop", value: "hip-hop" },
  { label: "Jazz", value: "jazz" },
  { label: "Tango", value: "tango" },
  { label: "Urbano", value: "urbano" },
];

const categoryOptions = [
  { label: "Baby", value: "baby" },
  { label: "Infantil", value: "infantil" },
  { label: "Infantil A", value: "infantil-a" },
  { label: "Infantil B", value: "infantil-b" },
  { label: "Juvenil", value: "juvenil" },
  { label: "Juvenil A", value: "juvenil-a" },
  { label: "Juvenil B", value: "juvenil-b" },
  { label: "Mayores", value: "mayores" },
  { label: "Pre infantil", value: "pre-infantil" },
  { label: "Pre juvenil", value: "pre-juvenil" },
  { label: "Profesional", value: "profesional" },
  { label: "Senior", value: "senior" },
  { label: "Sin asignar", value: "sin-asignar" },
];

const groupTypeOptions = [
  { label: "Solo", value: "solo" },
  { label: "Dúo", value: "duo" },
  { label: "Trío", value: "trio" },
  { label: "Grupal", value: "grupal" },
];

/**
 * Coarse to fine: the day splits the event into a handful of buckets before
 * anything else narrows within one.
 */
export const choreographyFilterFields: FilterFieldDefinition[] = [
  { id: "dia", label: "Día", options: dayOptions },
  { id: "estado", label: "Estado", options: statusOptions },
  { id: "modalidad", label: "Modalidad", options: modalityOptions },
  { id: "categoria", label: "Categoría", options: categoryOptions },
  { id: "tipo-grupo", label: "Tipo de grupo", options: groupTypeOptions },
];

export const totalFilterOptionCount = choreographyFilterFields.reduce(
  (total, field) => total + field.options.length,
  0,
);
