import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  choreographyNameField,
  choreographyNameMaxLength,
  isChoreographyNameChanged,
  normalizeChoreographyName,
  validateChoreographyName,
} from "@/lib/choreographies/choreography-name";

describe("the stored form of a choreography name (#764)", () => {
  test.each([
    ["  Los Cascanueces  ", "Los Cascanueces"],
    ["Los   Cascanueces", "Los Cascanueces"],
    ["los\tcascanueces\n", "Los Cascanueces"],
    ["LOS CASCANUECES", "Los Cascanueces"],
    ["danza de la luna y el sol", "Danza de la Luna y el Sol"],
    ["la danza del fuego", "La Danza del Fuego"],
    ["el lago", "El Lago"],
    ["paso a paso", "Paso a Paso"],
    ["jean-pierre en parís", "Jean-Pierre en París"],
    ["ángeles para élite", "Ángeles para Élite"],
    ["sub 12", "Sub 12"],
  ])("stores %j as %j", (typed, stored) => {
    expect(normalizeChoreographyName(typed)).toBe(stored);
  });

  test("leaves an already stored name as it is", () => {
    const stored = normalizeChoreographyName("  danza   DE la luna-llena ");

    expect(stored).toBe("Danza de la Luna-Llena");
    expect(normalizeChoreographyName(stored)).toBe(stored);
  });

  test("keeps a letter whose capital is two characters, so a second save stores the same", () => {
    const stored = normalizeChoreographyName("ßeta-ßeta");

    expect(stored).toBe("ßeta-ßeta");
    expect(normalizeChoreographyName(stored)).toBe(stored);
  });
});

describe("what a choreography name is refused for (#764)", () => {
  test("accepts a name and answers with its stored form", () => {
    expect(validateChoreographyName("  los   cascanueces ")).toEqual({
      ok: true,
      value: "Los Cascanueces",
    });
  });

  test.each([[""], ["   "], ["\t\n"]])("refuses the empty name %j", (typed) => {
    expect(validateChoreographyName(typed)).toEqual({
      ok: false,
      message: "Este campo es obligatorio.",
    });
  });

  test.each([["-"], ["!!!"], ["¿?"], ["💃🕺"]])(
    "refuses %j, which has no letter or digit",
    (typed) => {
      expect(validateChoreographyName(typed)).toEqual({
        ok: false,
        message: "Ingresá un nombre válido para la coreografía.",
      });
    },
  );

  test("accepts a name of exactly the ceiling and refuses one character more", () => {
    expect(choreographyNameMaxLength).toBe(120);
    expect(validateChoreographyName(`A${"a".repeat(119)}`)).toEqual({
      ok: true,
      value: `A${"a".repeat(119)}`,
    });
    expect(validateChoreographyName(`A${"a".repeat(120)}`)).toEqual({
      ok: false,
      message:
        "El nombre de la coreografía no puede superar los 120 caracteres.",
    });
  });

  test("measures the ceiling on the stored form, not on what was typed", () => {
    const fitsOnceCollapsed = `A${"a".repeat(59)}     B${"b".repeat(58)}`;

    expect(fitsOnceCollapsed.length).toBeGreaterThan(120);
    expect(validateChoreographyName(fitsOnceCollapsed)).toMatchObject({
      ok: true,
    });
    expect(validateChoreographyName(`  A${"a".repeat(120)}  `)).toMatchObject({
      ok: false,
    });
  });
});

describe("the choreography name as a form field (#764)", () => {
  const schema = z.object({ name: choreographyNameField() });

  test("parses to the stored form", () => {
    expect(schema.parse({ name: "  los   cascanueces " })).toEqual({
      name: "Los Cascanueces",
    });
  });

  test.each([
    ["  ", "Este campo es obligatorio."],
    ["!!!", "Ingresá un nombre válido para la coreografía."],
    [
      "a".repeat(121),
      "El nombre de la coreografía no puede superar los 120 caracteres.",
    ],
  ])("refuses %j with the message of the rule", (typed, message) => {
    const result = schema.safeParse({ name: typed });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ message, path: ["name"] }]);
  });
});

describe("the form field of a name already stored (#764)", () => {
  const schema = z.object({ name: choreographyNameField("-") });

  test("lets a name from before the rule through while it is left as it is", () => {
    expect(schema.parse({ name: "-" })).toEqual({ name: "-" });
  });

  test("holds it to the rule once it is edited", () => {
    expect(schema.safeParse({ name: "--" }).success).toBe(false);
    expect(schema.parse({ name: "sin título" })).toEqual({
      name: "Sin Título",
    });
  });
});

describe("whether a typed name changes the stored one (#764)", () => {
  test.each([
    ["Los Cascanueces", "Los Cascanueces", false],
    ["  los   cascanueces ", "Los Cascanueces", false],
    // Stored before the rule: left untouched it is no change, retyped it is.
    ["los cascanueces", "los cascanueces", false],
    ["los cascanueces ", "los cascanueces", true],
    ["El Lago", "Los Cascanueces", true],
  ])("typing %j over %j: %s", (typed, stored, changed) => {
    expect(isChoreographyNameChanged(typed, stored)).toBe(changed);
  });
});
