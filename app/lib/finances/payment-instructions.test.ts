import { describe, expect, test } from "vitest";

import {
  formatPaymentHolderLine,
  hasPaymentIdentifiers,
  toPaymentInstructions,
  type EventPaymentInstructionsColumns,
  type PaymentInstructions,
} from "@/lib/finances/payment-instructions";

function eventColumns(
  overrides: Partial<EventPaymentInstructionsColumns> = {},
): EventPaymentInstructionsColumns {
  return {
    paymentInstructionsCbu: null,
    paymentInstructionsAlias: null,
    paymentInstructionsHolderName: null,
    paymentInstructionsBankName: null,
    paymentInstructionsHolderCuit: null,
    paymentInstructionsText: null,
    ...overrides,
  };
}

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

describe("toPaymentInstructions", () => {
  test("is null when nothing is loaded", () => {
    expect(toPaymentInstructions(eventColumns())).toBeNull();
  });

  test("is null when only fields that cannot stand alone are loaded", () => {
    expect(
      toPaymentInstructions(
        eventColumns({
          paymentInstructionsBankName: "Banco Nación",
          paymentInstructionsAlias: "mi.alias-01",
        }),
      ),
    ).toBeNull();
  });

  test("maps the six columns when the CBU/CVU is loaded", () => {
    expect(
      toPaymentInstructions(
        eventColumns({
          paymentInstructionsCbu: "0070099330004512345678",
          paymentInstructionsAlias: "mi.alias-01",
          paymentInstructionsHolderName: "En Escena Producciones SRL",
          paymentInstructionsBankName: "Banco Galicia",
          paymentInstructionsHolderCuit: "30-71234567-1",
          paymentInstructionsText: "Poné el nombre de tu academia.",
        }),
      ),
    ).toEqual({
      cbu: "0070099330004512345678",
      alias: "mi.alias-01",
      holderName: "En Escena Producciones SRL",
      bankName: "Banco Galicia",
      holderCuit: "30-71234567-1",
      text: "Poné el nombre de tu academia.",
    });
  });

  test("is loaded when only the free text is set", () => {
    expect(
      toPaymentInstructions(
        eventColumns({ paymentInstructionsText: "Escribinos y te pasamos." }),
      ),
    ).toMatchObject({ cbu: null, text: "Escribinos y te pasamos." });
  });
});

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
