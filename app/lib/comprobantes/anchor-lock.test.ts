import { describe, expect, test } from "vitest";

import { choreographyAnchor, seminarAnchor } from "./anchor";
import { comprobanteAnchorLockKey } from "./anchor-lock.server";

describe("comprobanteAnchorLockKey", () => {
  test("keys a seminar on the pair, so two academies of one seminar never wait on each other", () => {
    expect(comprobanteAnchorLockKey(seminarAnchor("sem_1", "aca_1"))).not.toBe(
      comprobanteAnchorLockKey(seminarAnchor("sem_1", "aca_2")),
    );
    expect(comprobanteAnchorLockKey(seminarAnchor("sem_1", "aca_1"))).toBe(
      comprobanteAnchorLockKey(seminarAnchor("sem_1", "aca_1")),
    );
  });

  test("keeps the two kinds apart even when the ids collide", () => {
    expect(comprobanteAnchorLockKey(choreographyAnchor("unidad"))).not.toBe(
      comprobanteAnchorLockKey(seminarAnchor("unidad", "unidad")),
    );
  });
});
