import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * Where an academy is: one of the 24 Argentine jurisdictions, or `Otro país`
 * for an academy from abroad. A closed list so that the reports grouping
 * academies by it never split one province over two spellings. The column is
 * nullable for academies registered before the field existed; every form that
 * saves an academy requires it.
 */
export const provinceOptions = [
  { value: "buenos_aires", label: "Buenos Aires" },
  { value: "caba", label: "Ciudad Autónoma de Buenos Aires" },
  { value: "catamarca", label: "Catamarca" },
  { value: "chaco", label: "Chaco" },
  { value: "chubut", label: "Chubut" },
  { value: "cordoba", label: "Córdoba" },
  { value: "corrientes", label: "Corrientes" },
  { value: "entre_rios", label: "Entre Ríos" },
  { value: "formosa", label: "Formosa" },
  { value: "jujuy", label: "Jujuy" },
  { value: "la_pampa", label: "La Pampa" },
  { value: "la_rioja", label: "La Rioja" },
  { value: "mendoza", label: "Mendoza" },
  { value: "misiones", label: "Misiones" },
  { value: "neuquen", label: "Neuquén" },
  { value: "rio_negro", label: "Río Negro" },
  { value: "salta", label: "Salta" },
  { value: "san_juan", label: "San Juan" },
  { value: "san_luis", label: "San Luis" },
  { value: "santa_cruz", label: "Santa Cruz" },
  { value: "santa_fe", label: "Santa Fe" },
  { value: "santiago_del_estero", label: "Santiago del Estero" },
  { value: "tierra_del_fuego", label: "Tierra del Fuego" },
  { value: "tucuman", label: "Tucumán" },
  { value: "otro_pais", label: "Otro país" },
] as const;

export type Province = (typeof provinceOptions)[number]["value"];

const provinceValues = provinceOptions.map(({ value }) => value) as [
  Province,
  ...Province[],
];

/** What academies without a province are grouped under in a report. */
export const noProvinceLabel = "Sin provincia";

export function formatProvinceLabel(province: Province | null) {
  return (
    provinceOptions.find((option) => option.value === province)?.label ?? null
  );
}

/**
 * The form field: typed as text, since the select starts empty, and refused
 * unless it is one of the options.
 */
export function provinceField() {
  return z
    .string()
    .trim()
    .pipe(z.enum(provinceValues, { message: requiredFieldMessage }));
}
