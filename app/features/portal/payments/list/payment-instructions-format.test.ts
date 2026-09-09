import { describe, expect, test } from "vitest";

import type { PaymentInstructions } from "@/lib/finances/payment-instructions";

import {
  formatPaymentHolderLine,
  hasPaymentIdentifiers,
} from "./payment-instructions-format";

function instructions(
  overrides: Partial<PaymentInstructions> = {},
): PaymentInstructions {
  return {
    cbu: null,
    alias: null,
    holderName: null,
    bankName: null,
    holderCuit: null,
    text: null,
    ...overrides,
  };
}

describe("hasPaymentIdentifiers", () => {
  test("is false when only the free text is loaded", () => {
    expect(hasPaymentIdentifiers(instructions({ text: "Escribinos." }))).toBe(
      false,
    );
  });

  test("is true when any identifier is loaded", () => {
    expect(
      hasPaymentIdentifiers(instructions({ bankName: "Banco Galicia" })),
    ).toBe(true);
  });
});

describe("formatPaymentHolderLine", () => {
  test("joins the holder and the CUIT with a middle dot", () => {
    expect(
      formatPaymentHolderLine(
        instructions({
          holderName: "En Escena Producciones SRL",
          holderCuit: "30-71234567-1",
        }),
      ),
    ).toBe("En Escena Producciones SRL · CUIT 30-71234567-1");
  });

  test("renders the CUIT exactly as it was typed", () => {
    expect(
      formatPaymentHolderLine(instructions({ holderCuit: "30712345671" })),
    ).toBe("CUIT 30712345671");
  });

  test("drops the missing half", () => {
    expect(
      formatPaymentHolderLine(instructions({ holderName: "En Escena" })),
    ).toBe("En Escena");
    expect(formatPaymentHolderLine(instructions())).toBe("");
  });
});
