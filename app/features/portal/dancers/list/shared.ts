export type PortalDancerListItem = {
  active: boolean;
  birthDate: string;
  documentNumber: string | null;
  documentType: string | null;
  firstName: string;
  id: string;
  lastName: string;
  participationStatus: "no-event" | "not-participating" | "participating";
  verificationStatus: "incomplete" | "unverified" | "verified";
};

export type PortalDancersListLoaderData = {
  dancers: PortalDancerListItem[];
};
