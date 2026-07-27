import type { loadAdminAcademyFinances } from "./server";

export type AcademyFinancesLoaderData = Awaited<
  ReturnType<typeof loadAdminAcademyFinances>
>;
