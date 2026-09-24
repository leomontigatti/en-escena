import type { DuplicateWarning } from "@/lib/shared/duplicate-warning";

/** Everything about the other academy the signup is allowed to reveal. */
export type AcademyNameMatch = {
  createdAt: Date;
  id: string;
  name: string;
};

export type AcademyNameWarning = DuplicateWarning<
  "academy-name",
  AcademyNameMatch
>;
