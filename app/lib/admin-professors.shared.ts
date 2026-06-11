export const adminProfessorPageSize = 50;

export type AdminProfessorParticipationFilter = "yes" | "no" | "all";
export type AdminProfessorStatusFilter = "active" | "archived" | "all";
export type AdminProfessorParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";

export type AdministrativeProfessorListFilters = {
  participation: AdminProfessorParticipationFilter;
  query: string;
  status: AdminProfessorStatusFilter;
  page: number;
};
