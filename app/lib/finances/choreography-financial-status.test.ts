import { describe, expect, test } from "vitest";

import {
  choreographyStatusFilterOptions,
  formatInscriptionStatusBadge,
} from "./choreography-financial-status";
import {
  type InscriptionAnomaly,
  type InscriptionFinancialStatus,
  resolveInscriptionStatusBadge,
} from "./inscription-financial-status";

const everyStatus: InscriptionFinancialStatus[] = [
  "depositPending",
  "depositMet",
  "paidInFull",
];
const everyAnomaly: InscriptionAnomaly[] = ["overAllocated"];

describe("formatInscriptionStatusBadge", () => {
  test("labels a withdrawn inscription `Retirada`, neutral rather than alarming", () => {
    expect(formatInscriptionStatusBadge({ kind: "withdrawn" })).toEqual({
      kind: "withdrawn",
      label: "Retirada",
      value: "withdrawn",
      variant: "secondary",
    });
  });

  test("labels the over-allocation anomaly as destructive", () => {
    expect(
      formatInscriptionStatusBadge({
        anomaly: "overAllocated",
        kind: "anomaly",
      }),
    ).toEqual({
      kind: "anomaly",
      label: "Sobreasignada",
      value: "overAllocated",
      variant: "destructive",
    });
  });

  test("labels each of the three statuses", () => {
    expect(
      everyStatus.map(
        (status) =>
          formatInscriptionStatusBadge({ kind: "status", status }).label,
      ),
    ).toEqual(["Seña pendiente", "Señada", "Pagada"]);
  });
});

describe("choreographyStatusFilterOptions", () => {
  test("offers every badge the choreography column can show", () => {
    // The `Estado` column filter and the badge the cell shows come from the
    // same pair of functions: if a new derived axis could badge a choreography
    // without being here, the row would become unfilterable.
    const reachable = [
      ...everyStatus.map((status) =>
        resolveInscriptionStatusBadge({
          anomalies: [],
          financialStatus: status,
        }),
      ),
      ...everyAnomaly.map((anomaly) =>
        resolveInscriptionStatusBadge({
          anomalies: [anomaly],
          financialStatus: "depositMet",
        }),
      ),
    ].map((badge) => formatInscriptionStatusBadge(badge).value);

    expect(
      new Set(choreographyStatusFilterOptions.map((o) => o.value)),
    ).toEqual(new Set(reachable));
  });

  test("does not offer `Retirada`, which no choreography can be", () => {
    expect(
      choreographyStatusFilterOptions.map((option) => option.value),
    ).not.toContain("withdrawn");
  });
});
