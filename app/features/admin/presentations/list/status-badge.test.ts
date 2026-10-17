import { describe, expect, test } from "vitest";

import { readPresentationStatusBadge } from "./status-badge";

describe("readPresentationStatusBadge", () => {
  test("gives a row with no warning and no evaluation no badge, numbered or not", () => {
    expect(
      readPresentationStatusBadge({
        evaluationStatus: "pending",
        warnings: [],
        withdrawn: false,
      }),
    ).toBeNull();
  });

  test("leads with the most relevant warning and lists them all in that order", () => {
    expect(
      readPresentationStatusBadge({
        evaluationStatus: "pending",
        warnings: [
          { kind: "outOfBlock", message: "Fuera de su bloque" },
          { kind: "belowDeposit", message: "Seña pendiente" },
        ],
        withdrawn: false,
      }),
    ).toEqual({
      label: "Seña pendiente",
      messages: ["Seña pendiente", "Fuera de su bloque"],
      variant: "warning",
    });
  });

  test("makes a missing judge stand out from the other warnings", () => {
    expect(
      readPresentationStatusBadge({
        evaluationStatus: "pending",
        warnings: [
          { kind: "belowDeposit", message: "Seña pendiente" },
          {
            kind: "missingJudges",
            message: "Sin jueces: otras presentaciones ya los tienen",
          },
        ],
        withdrawn: false,
      }),
    ).toMatchObject({ label: "Sin jueces", variant: "destructive" });
  });

  test("replaces the warnings with the evaluation once the panel judged the row", () => {
    expect(
      readPresentationStatusBadge({
        evaluationStatus: "evaluated",
        warnings: [{ kind: "belowDeposit", message: "Seña pendiente" }],
        withdrawn: false,
      }),
    ).toEqual({ label: "Evaluada", messages: [], variant: "success" });
    expect(
      readPresentationStatusBadge({
        evaluationStatus: "disqualified",
        warnings: [],
        withdrawn: false,
      }),
    ).toEqual({ label: "Descalificada", messages: [], variant: "destructive" });
  });

  test("reads a withdrawn presentation as withdrawn whatever else it carries", () => {
    expect(
      readPresentationStatusBadge({
        evaluationStatus: "pending",
        warnings: [{ kind: "belowDeposit", message: "Seña pendiente" }],
        withdrawn: true,
      }),
    ).toEqual({ label: "Retirada", messages: [], variant: "secondary" });
  });
});
