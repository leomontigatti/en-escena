import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Baja la inicial de un texto para insertar un concepto del dominio dentro de una
 * oración (p. ej. "Factura C" → "factura C"), preservando el resto tal cual.
 */
export function lowercaseFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
