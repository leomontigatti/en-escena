import { describe, expect, test } from "vitest";

import { toPersonLastName, toPersonName } from "./person-name";

describe("toPersonName", () => {
  test.each([
    { input: "  juan   DE LA cruz ", name: "Juan de la Cruz" },
    { input: "maría-josé del valle", name: "María-José del Valle" },
    { input: "de los santos", name: "De los Santos" },
  ])("writes $input as $name", ({ input, name }) => {
    expect(toPersonName(input)).toBe(name);
  });
});

describe("toPersonLastName", () => {
  test("keeps a leading particle lowercase", () => {
    expect(toPersonLastName("DE LA CRUZ")).toBe("de la Cruz");
  });
});
