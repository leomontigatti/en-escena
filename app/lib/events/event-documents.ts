// The three static PDFs an event carries. One declaration per kind, read by the
// administration card, the portal menus and the storage layer, so a fourth
// document is one entry here instead of an edit in every surface.
//
// This module is client-safe: it has no imports and reads no environment.

export const eventDocumentKinds = [
  "professor_contract",
  "minor_authorization",
  "adult_contract",
] as const;

export type EventDocumentKind = (typeof eventDocumentKinds)[number];

/**
 * One entry per kind, `null` where the event has no document. Lives here rather
 * than beside the read path so the portal menu can type its props without
 * importing a `.server` module.
 */
export type EventDocumentDownloadUrls = Record<
  EventDocumentKind,
  string | null
>;

export type EventDocumentDeclaration = {
  /**
   * The name the browser saves the file under. ASCII on purpose: a non-ASCII
   * `filename=` needs the RFC 5987 `filename*` encoding to survive, and none of
   * these names need an accent to be readable. It is a download name, not UI
   * copy, so it does not follow the `CONTEXT.md` label.
   */
  downloadFileName: string;
  /** Spanish label the administration and the academies read. */
  label: string;
  /** Grammatical gender of `subjectLabel`, so rejection copy contracts right. */
  subjectGender: "feminine" | "masculine";
  /** The same label as the subject of a sentence: "El archivo de la …". */
  subjectLabel: string;
};

export const eventDocumentDeclarations: Readonly<
  Record<EventDocumentKind, EventDocumentDeclaration>
> = {
  adult_contract: {
    downloadFileName: "contrato-para-mayores.pdf",
    label: "Contrato para mayores",
    subjectGender: "masculine",
    subjectLabel: "contrato para mayores",
  },
  minor_authorization: {
    downloadFileName: "autorizacion-para-menores.pdf",
    label: "Autorización para menores",
    subjectGender: "feminine",
    subjectLabel: "autorización para menores",
  },
  professor_contract: {
    downloadFileName: "contrato-para-profesores.pdf",
    label: "Contrato para profesores",
    subjectGender: "masculine",
    subjectLabel: "contrato para profesores",
  },
};

/** The label of the menu item an academy clicks to get the document. */
export function getEventDocumentDownloadLabel(kind: EventDocumentKind) {
  return `Descargar ${eventDocumentDeclarations[kind].subjectLabel}`;
}

/** The rejection-copy options for one document, ready to spread. */
export function getEventDocumentSubjectOptions(kind: EventDocumentKind) {
  const declaration = eventDocumentDeclarations[kind];

  return {
    fieldLabel: declaration.subjectLabel,
    gender: declaration.subjectGender,
  };
}
