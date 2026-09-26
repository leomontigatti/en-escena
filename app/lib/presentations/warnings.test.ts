import { describe, expect, test } from "vitest";

import {
  derivePresentationWarnings,
  type PresentationWarning,
  type PresentationWarningRow,
} from "./warnings";

type RowOverrides = Partial<Omit<PresentationWarningRow, "category">> & {
  category?: Partial<PresentationWarningRow["category"]>;
  choreographyId: string;
  orderNumber: number | null;
};

function row({
  choreographyId,
  orderNumber,
  ...overrides
}: RowOverrides): PresentationWarningRow {
  return {
    activeDancers: [],
    choreographyId,
    choreographyNumber: orderNumber ?? 1,
    experienceLevel: null,
    financialStatus: "depositMet",
    groupType: "solo",
    orderNumber,
    ...overrides,
    category: {
      experienceLevels: [],
      maxAge: 12,
      minAge: 1,
      name: "Infantil",
      ...overrides.category,
    },
    schedule: {
      id: "schedule-1",
      name: "Sala A",
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      ...overrides.schedule,
    },
  };
}

function messagesOf(
  warnings: Map<string, PresentationWarning[]>,
  choreographyId: string,
) {
  return (warnings.get(choreographyId) ?? []).map((warning) => warning.message);
}

const ana = { id: "ana", name: "Ana Díaz" };

describe("derivePresentationWarnings", () => {
  test("marks a row without a level in a category that admits one", () => {
    const juvenil = { maxAge: 17, minAge: 13, name: "Juvenil I" };
    const warnings = derivePresentationWarnings([
      row({
        category: { ...juvenil, experienceLevels: ["amateur"] },
        choreographyId: "levelled",
        experienceLevel: "amateur",
        orderNumber: 1,
      }),
      row({
        category: { ...juvenil, experienceLevels: ["amateur"] },
        choreographyId: "numbered",
        orderNumber: 2,
      }),
      row({
        category: { ...juvenil, experienceLevels: [] },
        choreographyId: "levelless-category",
        orderNumber: 3,
      }),
      row({
        category: { ...juvenil, experienceLevels: ["amateur"] },
        choreographyId: "unnumbered",
        orderNumber: null,
      }),
    ]);

    expect(messagesOf(warnings, "numbered")).toEqual(["Sin nivel"]);
    expect(messagesOf(warnings, "unnumbered")).toEqual(["Sin nivel"]);
    expect(messagesOf(warnings, "levelled")).toEqual([]);
    expect(messagesOf(warnings, "levelless-category")).toEqual([]);
  });

  test("marks a choreography below `Señada`, numbered or not", () => {
    const warnings = derivePresentationWarnings([
      row({
        choreographyId: "numbered",
        financialStatus: "depositPending",
        orderNumber: 1,
      }),
      row({
        choreographyId: "late",
        financialStatus: "depositPending",
        orderNumber: null,
      }),
      row({ choreographyId: "covered", orderNumber: 2 }),
    ]);

    expect(messagesOf(warnings, "numbered")).toEqual(["Seña pendiente"]);
    expect(messagesOf(warnings, "late")).toEqual(["Seña pendiente"]);
    expect(warnings.has("covered")).toBe(false);
  });

  test("marks both rows of a spacing clash with the other's number and the dancer", () => {
    const warnings = derivePresentationWarnings([
      row({ choreographyId: "first", activeDancers: [ana], orderNumber: 1 }),
      row({ choreographyId: "filler", orderNumber: 2 }),
      row({ choreographyId: "second", activeDancers: [ana], orderNumber: 3 }),
    ]);

    expect(messagesOf(warnings, "first")).toEqual([
      "Separación insuficiente: comparte a Ana Díaz con la n.º 3",
    ]);
    expect(messagesOf(warnings, "second")).toEqual([
      "Separación insuficiente: comparte a Ana Díaz con la n.º 1",
    ]);
    expect(warnings.has("filler")).toBe(false);
  });

  test("leaves a shared dancer alone once four presentations separate them", () => {
    const warnings = derivePresentationWarnings([
      row({ choreographyId: "first", activeDancers: [ana], orderNumber: 1 }),
      row({ choreographyId: "b", orderNumber: 2 }),
      row({ choreographyId: "c", orderNumber: 3 }),
      row({ choreographyId: "d", orderNumber: 4 }),
      row({ choreographyId: "e", orderNumber: 5 }),
      row({ choreographyId: "second", activeDancers: [ana], orderNumber: 6 }),
    ]);

    expect(warnings.size).toBe(0);
  });

  test("counts the spacing within one schedule only", () => {
    const warnings = derivePresentationWarnings([
      row({ choreographyId: "morning", activeDancers: [ana], orderNumber: 1 }),
      row({
        choreographyId: "evening",
        activeDancers: [ana],
        orderNumber: 2,
        schedule: {
          id: "schedule-2",
          name: "Sala A",
          scheduledDate: "2026-05-01",
          startTime: "18:00",
        },
      }),
    ]);

    expect(warnings.size).toBe(0);
  });

  test("flags only the presentation that sits outside its block", () => {
    const teen = { maxAge: 100, minAge: 13, name: "Juvenil" };
    const warnings = derivePresentationWarnings([
      row({ choreographyId: "child-1", orderNumber: 1 }),
      row({ choreographyId: "teen-early", category: teen, orderNumber: 2 }),
      row({ choreographyId: "child-2", orderNumber: 3 }),
      row({ choreographyId: "child-3", orderNumber: 4 }),
      row({ choreographyId: "teen-1", category: teen, orderNumber: 5 }),
    ]);

    expect(messagesOf(warnings, "teen-early")).toEqual(["Fuera de su bloque"]);
    expect(warnings.size).toBe(1);
  });

  test("flags a presentation moved across an experience level boundary", () => {
    const warnings = derivePresentationWarnings([
      row({
        choreographyId: "nudo-1",
        experienceLevel: "nudo",
        orderNumber: 1,
      }),
      row({
        choreographyId: "amateur-early",
        experienceLevel: "amateur",
        orderNumber: 2,
      }),
      row({
        choreographyId: "nudo-2",
        experienceLevel: "nudo",
        orderNumber: 3,
      }),
      row({
        choreographyId: "nudo-3",
        experienceLevel: "nudo",
        orderNumber: 4,
      }),
      row({
        choreographyId: "amateur-1",
        experienceLevel: "amateur",
        orderNumber: 5,
      }),
    ]);

    expect(messagesOf(warnings, "amateur-early")).toEqual([
      "Fuera de su bloque",
    ]);
    expect(warnings.size).toBe(1);
  });

  test("flags nothing when the levels run in their own order", () => {
    const warnings = derivePresentationWarnings([
      row({
        choreographyId: "nudo-1",
        experienceLevel: "nudo",
        orderNumber: 1,
      }),
      row({
        choreographyId: "nudo-2",
        experienceLevel: "nudo",
        orderNumber: 2,
      }),
      row({
        choreographyId: "amateur-1",
        experienceLevel: "amateur",
        orderNumber: 3,
      }),
      row({ choreographyId: "no-level", orderNumber: 4 }),
    ]);

    expect(warnings.size).toBe(0);
  });

  test("flags the higher choreography number when the displaced set ties", () => {
    const teen = { maxAge: 100, minAge: 13, name: "Juvenil" };
    const warnings = derivePresentationWarnings([
      row({
        choreographyId: "teen",
        category: teen,
        choreographyNumber: 20,
        orderNumber: 1,
      }),
      row({ choreographyId: "child", choreographyNumber: 10, orderNumber: 2 }),
    ]);

    expect(messagesOf(warnings, "teen")).toEqual(["Fuera de su bloque"]);
    expect(warnings.size).toBe(1);
  });

  test("ignores an unnumbered choreography when reading the block order", () => {
    const teen = { maxAge: 100, minAge: 13, name: "Juvenil" };
    const warnings = derivePresentationWarnings([
      row({ choreographyId: "teen", category: teen, orderNumber: 1 }),
      row({ choreographyId: "late-child", orderNumber: null }),
      row({ choreographyId: "teen-2", category: teen, orderNumber: 2 }),
    ]);

    expect(warnings.size).toBe(0);
  });

  test("lists the warnings of one row most relevant first", () => {
    const teen = { maxAge: 100, minAge: 13, name: "Juvenil" };
    const warnings = derivePresentationWarnings([
      row({
        choreographyId: "teen-early",
        activeDancers: [ana],
        category: teen,
        financialStatus: "depositPending",
        orderNumber: 1,
      }),
      row({ choreographyId: "child-1", activeDancers: [ana], orderNumber: 2 }),
      row({ choreographyId: "child-2", orderNumber: 3 }),
      row({ choreographyId: "child-3", orderNumber: 4 }),
      row({ choreographyId: "teen-1", category: teen, orderNumber: 5 }),
    ]);

    expect(messagesOf(warnings, "teen-early")).toEqual([
      "Seña pendiente",
      "Separación insuficiente: comparte a Ana Díaz con la n.º 2",
      "Fuera de su bloque",
    ]);
  });

  test("marks an unnumbered row whose schedule already has an evaluated presentation", () => {
    const dayTwo = {
      id: "day-2",
      name: "Sala A",
      scheduledDate: "2026-05-02",
      startTime: "10:00",
    };
    const warnings = derivePresentationWarnings(
      [
        row({ choreographyId: "scored", orderNumber: 1 }),
        row({ choreographyId: "tail", orderNumber: 2 }),
        row({ choreographyId: "late-day-one", orderNumber: null }),
        row({
          choreographyId: "late-day-two",
          orderNumber: null,
          schedule: dayTwo,
        }),
      ],
      new Set(["scored", "tail"]),
    );

    expect(messagesOf(warnings, "late-day-one")).toEqual([
      "Su cronograma ya fue evaluado: se ubicará después de los cronogramas ya evaluados",
    ]);
    expect(warnings.has("late-day-two")).toBe(false);
    expect(warnings.has("tail")).toBe(false);
  });
});
