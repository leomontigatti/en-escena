import type { UserDetailLoaderData } from "@/lib/admin/users/user-detail.shared";

import type { IndividualLinkDetail } from "./individual/shared";

/** The user's detail, with the individual behind it when it is one. */
export type UserDetailRouteLoaderData = UserDetailLoaderData & {
  individual: IndividualLinkDetail | null;
};
