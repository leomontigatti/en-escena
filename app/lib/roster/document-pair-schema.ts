import type { z } from "zod";

/**
 * The both-or-neither rule every roster document pair follows: a person may be
 * loaded without a document, but never with half of one. The server twin lives
 * in `normalizeDancerDocumentPair` / `normalizeProfessorDocumentPair`.
 */
export function refineDocumentPair(
  values: { documentType: string; documentNumber: string },
  context: z.RefinementCtx,
) {
  if (!values.documentType && !values.documentNumber) {
    return;
  }

  if (!values.documentType) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná el tipo de documento.",
      path: ["documentType"],
    });
  }

  if (!values.documentNumber) {
    context.addIssue({
      code: "custom",
      message: "Ingresá el número de documento.",
      path: ["documentNumber"],
    });
  }
}
