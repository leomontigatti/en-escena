import type { ParticipationStatus } from "@/lib/participation/participation";

export type PortalDancerListItem = {
  active: boolean;
  birthDate: string;
  documentNumber: string | null;
  documentType: string | null;
  firstName: string;
  id: string;
  lastName: string;
  participationStatus: ParticipationStatus;
  verificationStatus: "incomplete" | "unverified" | "verified";
};

export type PortalDancersListLoaderData = {
  dancers: PortalDancerListItem[];
};
