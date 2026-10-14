import type { IdentityDocumentType } from "@/lib/roster/identity-document";

/**
 * The one owner of `Estado de verificación de bailarín`: every surface derives
 * the status, decides whether an edit invalidates it, whether the portal may
 * edit the identity, whether it can be verified, and how it is named, from
 * here. The list filter's SQL twin is `verification.server.ts`.
 */
export type DancerVerificationStatusCode =
  "incomplete" | "unverified" | "verified";

export type DancerVerificationPendingItem =
  | "documentType"
  | "documentNumber"
  | "documentFrontImage"
  | "documentBackImage";

export type DancerVerificationStatus = {
  code: DancerVerificationStatusCode;
  /** Empty unless `code` is `"incomplete"`. */
  pendingItems: DancerVerificationPendingItem[];
};

/** Everything the identity document shows, so everything a change to clears verification. */
export type DancerAttestedIdentity = {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: IdentityDocumentType | null;
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
};

type DancerVerificationInput = Pick<
  DancerAttestedIdentity,
  | "documentType"
  | "documentNumber"
  | "documentFrontImageStorageKey"
  | "documentBackImageStorageKey"
> & { identityVerifiedAt: Date | null };

/** In the order the facets and the badges list them. */
export const dancerVerificationStatusCodes = [
  "incomplete",
  "unverified",
  "verified",
] as const satisfies readonly DancerVerificationStatusCode[];

export function deriveDancerVerificationStatus(
  input: DancerVerificationInput,
): DancerVerificationStatus {
  const pendingItems: DancerVerificationPendingItem[] = [];

  // Truthiness, not `!== null`: an empty string is as missing as a null, and
  // the SQL twin reads it the same way.
  if (!input.documentType) {
    pendingItems.push("documentType");
  }

  if (!input.documentNumber) {
    pendingItems.push("documentNumber");
  }

  if (!input.documentFrontImageStorageKey) {
    pendingItems.push("documentFrontImage");
  }

  if (!input.documentBackImageStorageKey) {
    pendingItems.push("documentBackImage");
  }

  if (pendingItems.length > 0) {
    return { code: "incomplete", pendingItems };
  }

  return {
    code: input.identityVerifiedAt === null ? "unverified" : "verified",
    pendingItems,
  };
}

/**
 * Whether saving `next` over `previous` clears the verification: any change to
 * what the document attests does, and nothing else does. Both sides must be
 * normalized values. Names compare without letter case, which a document does
 * not attest: the panel and the portal case a leading particle differently
 * (`de la Cruz`, `De la Cruz`), and re-casing is no change.
 */
export function invalidatesDancerVerification(
  previous: DancerAttestedIdentity,
  next: DancerAttestedIdentity,
) {
  return (
    !isSameName(previous.firstName, next.firstName) ||
    !isSameName(previous.lastName, next.lastName) ||
    previous.birthDate !== next.birthDate ||
    previous.documentType !== next.documentType ||
    previous.documentNumber !== next.documentNumber ||
    previous.documentFrontImageStorageKey !==
      next.documentFrontImageStorageKey ||
    previous.documentBackImageStorageKey !== next.documentBackImageStorageKey
  );
}

function isSameName(previous: string, next: string) {
  return (
    previous.toLocaleLowerCase("es-AR") === next.toLocaleLowerCase("es-AR")
  );
}

/** A verified identity is corrected only from administration. */
export function isDancerIdentityLockedForAcademy(
  status: DancerVerificationStatus,
) {
  return status.code === "verified";
}

/** One answer for the `Verificar identidad` affordance and the server guard. */
export function canVerifyDancerIdentity(status: DancerVerificationStatus) {
  return status.code === "unverified";
}

export function formatDancerVerificationStatusLabel(
  code: DancerVerificationStatusCode,
) {
  switch (code) {
    case "incomplete":
      return "Incompleto";
    case "unverified":
      return "Sin verificar";
    case "verified":
      return "Verificado";
  }
}

export function getDancerVerificationStatusBadgeVariant(
  code: DancerVerificationStatusCode,
) {
  switch (code) {
    case "incomplete":
      return "warning";
    case "unverified":
      return "info";
    case "verified":
      return "success";
  }
}

/** Written to complete the portal's `Falta cargar …` sentence. */
export function formatDancerVerificationPendingItemLabel(
  item: DancerVerificationPendingItem,
) {
  switch (item) {
    case "documentType":
      return "tipo de documento";
    case "documentNumber":
      return "número de documento";
    case "documentFrontImage":
      return "frente del documento";
    case "documentBackImage":
      return "dorso del documento";
  }
}

/** The admin list's `Verificación` facet; `all` filters nothing. */
export type DancerVerificationFilter = DancerVerificationStatusCode | "all";

export function readDancerVerificationFilter(
  value: string | null,
): DancerVerificationFilter {
  switch (value) {
    case "incompleta":
      return "incomplete";
    case "sin-verificar":
      return "unverified";
    case "verificados":
      return "verified";
    default:
      return "all";
  }
}

/** `all` is encoded by the absence of the parameter, so it returns `null`. */
export function toDancerVerificationSearchValue(
  value: DancerVerificationFilter,
) {
  return value === "all" ? null : toDancerVerificationStatusSearchValue(value);
}

/** The URL value that narrows the admin list to one status. */
export function toDancerVerificationStatusSearchValue(
  code: DancerVerificationStatusCode,
) {
  switch (code) {
    case "incomplete":
      return "incompleta";
    case "unverified":
      return "sin-verificar";
    case "verified":
      return "verificados";
  }
}
