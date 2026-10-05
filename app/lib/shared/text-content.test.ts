import { describe, expect, test } from "vitest";

import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  contentTextField,
  missingTextContentMessage,
} from "@/lib/shared/text-content";

function firstError(value: string) {
  const parsed = contentTextField().safeParse(value);

  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("a text field that has to say something", () => {
  test.each([".", "...", " - ", "¿?", "🙂"])(
    "refuses %j, which holds no letter and no digit",
    (value) => {
      expect(firstError(value)).toBe(missingTextContentMessage);
    },
  );

  test.each(["", "   "])("reads %j as a missing field", (value) => {
    expect(firstError(value)).toBe(requiredFieldMessage);
  });

  test.each(["Academia Ñandú", "Estudio 21", "D.A.N.Z.A.", "9 de Julio", "É"])(
    "accepts %j",
    (value) => {
      expect(firstError(value)).toBeUndefined();
    },
  );

  test("hands back the trimmed text", () => {
    expect(contentTextField().parse("  Rosario  ")).toBe("Rosario");
  });
});
