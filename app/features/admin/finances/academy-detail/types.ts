import type { loadAdministrativeAcademyFinanceDetail } from "./server";

export type AcademyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeAcademyFinanceDetail>
>;
