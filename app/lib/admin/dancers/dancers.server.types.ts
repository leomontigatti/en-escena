import type { dancers } from "@/db/schema";
import type { DancerEditConsequence } from "@/lib/admin/dancers/dancers.server.shared";
import type {
  DancerIdentificationStatus,
  DancerListFilters,
} from "@/lib/admin/dancers/dancers.shared";
import type { ParticipationStatus } from "@/lib/participation/participation.shared";
import type { DancerEditableSnapshot } from "@/lib/dancers/dancer-records.server";

export type DancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  academyName: string;
  participationStatus: ParticipationStatus;
  identificationStatus: DancerIdentificationStatus;
};

export type DancerListResult = {
  filters: DancerListFilters;
  hasAnyDancer: boolean;
  items: DancerListItem[];
  totalCount: number;
  totalPages: number;
};

export type DancerDetail = {
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
  participationStatus: ParticipationStatus;
  identificationStatus: DancerIdentificationStatus;
  participatedInAnyEvent: boolean;
  editConsequence: DancerEditConsequence;
  inscriptions: DancerInscription[];
  choreographyNames: string[];
};

export type DancerInscription = {
  id: string;
  choreographyName: string;
  groupType: "solo" | "duo" | "trio" | "grupal";
  basePriceAmount: number | null;
  discountAmount: number;
  estimatedSubtotalAmount: number | null;
};

export type DancerUpdateInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
};

export type DancerFieldErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "birthDate"
    | "documentType"
    | "documentNumber"
    | "documentFrontImageStorageKey"
    | "documentBackImageStorageKey",
    string
  >
>;

export type DancerMutationResult =
  | {
      ok: true;
      dancer: DancerEditableSnapshot;
      verificationInvalidated: boolean;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: DancerFieldErrors;
      values: DancerUpdateInput;
    };

export type DancerStatusMutationResult = {
  dancer: DancerEditableSnapshot;
};
