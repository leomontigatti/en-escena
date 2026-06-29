import type { loadAdministrativeAcademyAccountCurrent } from "./server";

export type AccountCurrentLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeAcademyAccountCurrent>
>;
