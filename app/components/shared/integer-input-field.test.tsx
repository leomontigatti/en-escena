import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { IntegerInputField, getIntegerInputValue } from "./integer-input-field";

type TestFormValues = {
  amount: string;
};

function TestSuffixIntegerInputField({ amount }: { amount: string }) {
  const form = useForm<TestFormValues>({
    defaultValues: {
      amount,
    },
  });

  return (
    <IntegerInputField
      control={form.control}
      id="amount"
      label="Cupo"
      name="amount"
      suffix=" / 64 disponibles"
    />
  );
}

describe("IntegerInput", () => {
  test("normalizes values to digits only", () => {
    expect(getIntegerInputValue("12e3 pesos")).toBe("123");
    expect(getIntegerInputValue("+54-351")).toBe("54351");
    expect(getIntegerInputValue("abc")).toBe("");
  });
});

describe("IntegerInputField", () => {
  // A lone " / 64 disponibles" hanging off an empty field reads as a typo.
  test("hides the suffix while there is no value to trail", () => {
    const markup = renderToStaticMarkup(
      <TestSuffixIntegerInputField amount="" />,
    );

    expect(markup).not.toContain("/ 64 disponibles");
  });
});
