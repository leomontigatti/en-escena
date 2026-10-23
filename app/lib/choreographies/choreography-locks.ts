/**
 * `Datos bloqueados de coreografía`, decided once: for one choreography and
 * one actor, which of its data can still change and, when it cannot, why.
 * Every screen, every action guard and every blocked-action dialog reads its
 * answer from here, so a lock the view shows is the lock the server enforces.
 *
 * The decision is pure. Each caller gathers the two facts it needs — the
 * evaluated one from `app/lib/presentations/evaluation-lock.server.ts`, inside
 * its own transaction when it holds a row lock — and asks. The event context
 * (an event that is not the active one is read-only) is not a choreography
 * lock: callers compose it beside this answer.
 *
 * See docs/domain/choreographies.md, "Choreography Locks", and ADR-0009: money
 * locks nothing here. A comprobante turns a removal into a withdrawal; it does
 * not refuse it.
 */

/**
 * Who asks. The `academy` never changes the roster or the structure and never
 * deletes, whatever the choreography's state (ADR-0009: the restriction is
 * role-based, not a window). The `auditor` reads the admin panel and changes
 * nothing.
 */
export type ChoreographyLockActor = "academy" | "admin" | "auditor";

export type ChoreographyLockFacts = {
  /** A judge saved a score for its presentation, or it was disqualified. */
  isEvaluated: boolean;
  isWithdrawn: boolean;
};

/**
 * Why a capability is closed. A state of the data wins over the actor's role,
 * so an auditor and an administrator are told the same thing about the same
 * choreography; `role` is only the answer when the data would have let it
 * through.
 */
export type ChoreographyLockReason =
  "evaluated-presentation" | "role" | "withdrawn";

/** The reasons that are states of the choreography rather than of the viewer. */
export type ChoreographyDataLockReason = Exclude<
  ChoreographyLockReason,
  "role"
>;

/**
 * What can change. Which fields belong to each class is the surface's: the
 * academy completes its `pendingOperationalChoreographyData` through the music
 * and `Evaluar como profesional`, administration through the professors.
 */
export type ChoreographyCapability =
  /** The name, which no evaluation closes. */
  | "rename"
  /** Modality, submodality, roster, category, level and schedule capacity. */
  | "lockedChoreographyData"
  /** Music, professors and, for the academy, `Evaluar como profesional`. */
  | "pendingOperationalChoreographyData"
  | "delete";

export type ChoreographyCapabilityLock =
  | { locked: false; reason: null }
  | { locked: true; reason: ChoreographyLockReason };

export type ChoreographyLocks = Record<
  ChoreographyCapability,
  ChoreographyCapabilityLock
>;

const openLock: ChoreographyCapabilityLock = { locked: false, reason: null };

/** Which actor may change each capability on a choreography nothing locks. */
const capabilitiesByActor: Record<
  ChoreographyLockActor,
  ReadonlySet<ChoreographyCapability>
> = {
  academy: new Set(["pendingOperationalChoreographyData"]),
  admin: new Set([
    "delete",
    "lockedChoreographyData",
    "pendingOperationalChoreographyData",
    "rename",
  ]),
  auditor: new Set(),
};

export function resolveChoreographyLocks(
  input: ChoreographyLockFacts & { actor: ChoreographyLockActor },
): ChoreographyLocks {
  const allowed = capabilitiesByActor[input.actor];

  function decide(
    capability: ChoreographyCapability,
  ): ChoreographyCapabilityLock {
    // A withdrawal is final: nothing is open on a withdrawn choreography, the
    // name included. Its money is handled from the finance surfaces.
    if (input.isWithdrawn) {
      return { locked: true, reason: "withdrawn" };
    }

    // An evaluation cannot be annulled, so it closes everything but the name.
    if (input.isEvaluated && capability !== "rename") {
      return { locked: true, reason: "evaluated-presentation" };
    }

    return allowed.has(capability)
      ? openLock
      : { locked: true, reason: "role" };
  }

  return {
    delete: decide("delete"),
    lockedChoreographyData: decide("lockedChoreographyData"),
    pendingOperationalChoreographyData: decide(
      "pendingOperationalChoreographyData",
    ),
    rename: decide("rename"),
  };
}

/** The locks of an internal user, whose role decides admin or auditor. */
export function toChoreographyLockActor(
  canWriteInAdminPanel: boolean,
): ChoreographyLockActor {
  return canWriteInAdminPanel ? "admin" : "auditor";
}

/**
 * The one sentence the evaluated lock speaks with: every refusal the server
 * returns, and the alert below in two parts. The lock is not per field — an
 * evaluated choreography is closed as a whole, so naming the field the form
 * happened to send would suggest the others are open.
 */
export const evaluatedChoreographyMessage =
  "Esta coreografía ya fue evaluada y no puede modificarse.";

/**
 * The evaluated lock as an alert: the refusal's sentence split in two, so the
 * description does not repeat the title word for word.
 */
export const evaluatedChoreographyAlert = {
  description: "No puede modificarse.",
  title: "Esta coreografía ya fue evaluada",
} as const;

/**
 * Administration's alert also says the lock is for good (style guide, Detail
 * pages): there is no score annulment, so nothing unlocks an evaluated
 * choreography.
 */
export const evaluatedChoreographyNotice = `${evaluatedChoreographyAlert.description} La evaluación no se puede anular.`;

/** What administration's actions answer on a withdrawn choreography. */
export const withdrawnChoreographyMessage =
  "Esta coreografía está retirada y no se puede modificar. Para que vuelva a participar, registrá una nueva.";

/** What administration's saves answer, by the state that closed them. */
export const adminLockRefusals: Record<ChoreographyDataLockReason, string> = {
  "evaluated-presentation": evaluatedChoreographyMessage,
  withdrawn: withdrawnChoreographyMessage,
};

/** The withdrawal as the portal's alert: final, and how to take part again. */
export const withdrawnChoreographyAlert = {
  description:
    "Un retiro es definitivo, así que no puede modificarse. Para que vuelva a participar, registrá una coreografía nueva.",
  title: "Esta coreografía está retirada",
} as const;

/**
 * The academy's refusals name the field it tried to save, because each portal
 * save carries one: the music, or how the choreography is evaluated.
 */
export const academyPendingOperationalRefusals: Record<
  "music" | "professionalEvaluation",
  Record<ChoreographyDataLockReason, string>
> = {
  music: {
    "evaluated-presentation":
      "No podés editar la música porque la coreografía ya fue evaluada.",
    withdrawn: "No podés editar la música porque la coreografía está retirada.",
  },
  professionalEvaluation: {
    "evaluated-presentation":
      "No podés cambiar cómo se evalúa porque la coreografía ya fue evaluada.",
    withdrawn:
      "No podés cambiar cómo se evalúa porque la coreografía está retirada.",
  },
};

/**
 * What the blocked `Eliminar` says, by the one reason that applies: the two
 * never meet, because a withdrawal deletes the presentation an evaluation
 * would need. Each has a single reason, so it is a sentence rather than a
 * one-item list repeating the title.
 */
export const choreographyDeleteLockCopy: Record<
  ChoreographyDataLockReason,
  { description: string; label: string; reason: string; reasonsTitle: string }
> = {
  "evaluated-presentation": {
    description:
      "Una coreografía con la presentación evaluada no se puede eliminar ni retirar.",
    label: "La presentación ya fue evaluada.",
    reason: "La evaluación no se puede anular.",
    reasonsTitle: "La presentación ya fue evaluada",
  },
  withdrawn: {
    description: "Una coreografía retirada no se puede eliminar.",
    label: "La coreografía está retirada.",
    reason:
      "El retiro es definitivo: para que vuelva a participar, registrá una coreografía nueva.",
    reasonsTitle: "La coreografía está retirada",
  },
};

/** The state that closed a capability, or `null` when it is open or only the role closes it. */
export function readDataLockReason(
  lock: ChoreographyCapabilityLock,
): ChoreographyDataLockReason | null {
  return lock.reason === null || lock.reason === "role" ? null : lock.reason;
}
