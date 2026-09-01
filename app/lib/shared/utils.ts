import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Lowercases the first letter of a text so a domain concept can be inserted
 * inside a sentence (e.g. "Factura C" → "factura C"), leaving the rest as is.
 */
export function lowercaseFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
