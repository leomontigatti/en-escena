import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import {
  IntegerInput,
  IntegerInputField,
  getIntegerInputValue,
} from "./integer-input-field";

type TestFormValues = {
  amount: string;
};

function TestIntegerInputField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      amount: "1200",
    },
  });

  return (
    <IntegerInputField
      autoComplete="off"
      control={form.control}
      description="Ingresá solo números."
      id="amount"
      label="Monto"
      min="1"
      name="amount"
      step="1"
    />
  );
}

function TestDisabledIntegerInputField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      amount: "1200",
    },
  });

  return (
    <IntegerInputField
      control={form.control}
      disabled
      id="amount"
      label="Monto"
      name="amount"
    />
  );
}

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
  test("renders a text input optimized for integer entry", () => {
    const markup = renderToStaticMarkup(<IntegerInput name="amount" />);

    expect(markup).toContain('type="text"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('pattern="[0-9]*"');
  });

  test("normalizes values to digits only", () => {
    expect(getIntegerInputValue("12e3 pesos")).toBe("123");
    expect(getIntegerInputValue("+54-351")).toBe("54351");
    expect(getIntegerInputValue("abc")).toBe("");
  });
});

describe("IntegerInputField", () => {
  test("renders a labelled integer input controlled by React Hook Form", () => {
    const markup = renderToStaticMarkup(<TestIntegerInputField />);

    expect(markup).toContain('for="amount"');
    expect(markup).toContain('id="amount"');
    expect(markup).toContain('name="amount"');
    expect(markup).toContain('value="1200"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('pattern="[0-9]*"');
    expect(markup).toContain("Ingresá solo números.");
  });

  // The suffix trails the typed value, so it is laid out over an invisible copy
  // of that value rather than measured.
  test("renders the suffix over an invisible mirror of the typed value", () => {
    const markup = renderToStaticMarkup(
      <TestSuffixIntegerInputField amount="135" />,
    );

    expect(markup).toContain("/ 64 disponibles");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain('class="invisible">135<');
  });

  // A lone " / 64 disponibles" hanging off an empty field reads as a typo.
  test("hides the suffix while there is no value to trail", () => {
    const markup = renderToStaticMarkup(
      <TestSuffixIntegerInputField amount="" />,
    );

    expect(markup).not.toContain("/ 64 disponibles");
  });

  test("passes disabled to the input and renders the lock affordance", () => {
    const markup = renderToStaticMarkup(<TestDisabledIntegerInputField />);

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain("lucide-lock");
  });
});
