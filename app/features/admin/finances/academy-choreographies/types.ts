import type { loadAcademyFinances } from "./server";

export type AcademyFinancesLoaderData = Awaited<
  ReturnType<typeof loadAcademyFinances>
>;
