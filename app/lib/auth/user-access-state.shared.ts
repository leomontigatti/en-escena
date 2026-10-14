/**
 * `userAccessState` —ui: "Estado de acceso de usuario"— is whether a user may
 * hold an access session: `active` or `suspended`. It is stored as the
 * `suspended` boolean on `user`, and this module is the one place that boolean
 * is turned into a state: readers branch on the state, never on the column.
 *
 * The rule reads no role. An academy row holding `suspended` is refused at
 * sign-in and at `Recuperación de acceso` like any other, so it reads as
 * suspended everywhere it is shown (#715).
 *
 * This is the pure half, usable from views and from tests. The query
 * condition lives in `user-access-state.server.ts`.
 */
export type UserAccessState = "active" | "suspended";

/** The URL parameter the user list filters this state through. */
const userAccessStateSearchParam = "estado";

export function toUserAccessState(row: {
  suspended: boolean;
}): UserAccessState {
  return row.suspended ? "suspended" : "active";
}

/** `null` when the URL names no state, or one this module does not know. */
export function readUserAccessStateFilter(
  searchParams: URLSearchParams,
): UserAccessState | null {
  const value = searchParams.get(userAccessStateSearchParam);

  return value === "active" || value === "suspended" ? value : null;
}

const userAccessStateLabels = {
  active: "Activo",
  suspended: "Suspendido",
} satisfies Record<UserAccessState, string>;

/** The two states as select and filter options, labelled from the one table. */
export const userAccessStateOptions = (
  ["active", "suspended"] as const satisfies readonly UserAccessState[]
).map((value) => ({ value, label: userAccessStateLabels[value] }));

export function getUserAccessStateLabel(state: UserAccessState) {
  return userAccessStateLabels[state];
}

export function getUserAccessStateBadgeVariant(state: UserAccessState) {
  return state === "active" ? "success" : "destructive";
}
