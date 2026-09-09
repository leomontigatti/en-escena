import { describe, expect, test } from "vitest";

import {
  toPaymentInstructions,
  type EventPaymentInstructionsColumns,
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
