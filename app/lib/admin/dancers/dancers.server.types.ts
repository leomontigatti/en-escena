import type { dancers } from "@/db/schema";
import type {
  AdminDancerIdentificationStatus,
  AdminDancerParticipationStatus,
  AdministrativeDancerAuditAction,
  AdministrativeDancerListFilters,
} from "@/lib/admin/dancers/dancers.shared";
import type { DancerEditableSnapshot } from "@/lib/dancers/dancer-records.server";

export type AdministrativeDancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  academyName: string;
  participationStatus: AdminDancerParticipationStatus;
  identificationStatus: AdminDancerIdentificationStatus;
};

export type AdministrativeDancerListResult = {
  filters: AdministrativeDancerListFilters;
  hasAnyDancer: boolean;
  items: AdministrativeDancerListItem[];
  totalCount: number;
  totalPages: number;
};

export type AdministrativeDancerDetail = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  active: boolean;
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  academy: {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
  };
  participationStatus: AdminDancerParticipationStatus;
  identificationStatus: AdminDancerIdentificationStatus;
  participatedInAnyEvent: boolean;
  correctionReasonRequired: boolean;
  inscriptions: AdministrativeDancerInscription[];
  choreographyNames: string[];
};

export type AdministrativeDancerInscription = {
  id: string;
  choreographyName: string;
  groupType: "solo" | "duo" | "trio" | "grupal";
  basePriceAmount: number | null;
  discountAmount: number;
  estimatedSubtotalAmount: number | null;
};

export type AdministrativeDancerUpdateInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
  correctionReason: string;
};

export type AdministrativeDancerStatusInput = {
  correctionReason: string;
};

export type AdministrativeDancerFieldErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "birthDate"
    | "documentType"
    | "documentNumber"
    | "documentFrontImageStorageKey"
    | "documentBackImageStorageKey"
    | "correctionReason",
    string
  >
>;

export type AdministrativeDancerMutationResult =
  | {
      ok: true;
      dancer: DancerEditableSnapshot;
      verificationInvalidated: boolean;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: AdministrativeDancerFieldErrors;
      values: AdministrativeDancerUpdateInput;
    };

export type AdministrativeDancerStatusMutationResult =
  | {
      ok: true;
      dancer: DancerEditableSnapshot;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: Pick<AdministrativeDancerFieldErrors, "correctionReason">;
      values: AdministrativeDancerStatusInput;
    };

export type AdministrativeDancerAuditEntryInput = {
  action: AdministrativeDancerAuditAction;
  adminUserId: string;
  afterValues: DancerEditableSnapshot;
  beforeValues: DancerEditableSnapshot;
  dancerId: string;
  eventId: string | null;
  reason: string | null;
};
