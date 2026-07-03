import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { DateOnlyField } from "./date-only-field";

type TestFormValues = {
  birthDate: string;
};

function TestDateOnlyField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      birthDate: "2026-07-02",
    },
  });

  return (
    <DateOnlyField
      control={form.control}
      id="birth-date"
      label="Fecha de nacimiento"
      name="birthDate"
    />
  );
}

function TestDisabledDateOnlyField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      birthDate: "2026-07-02",
    },
  });

  return (
    <DateOnlyField
      control={form.control}
      disabled
      id="birth-date"
      label="Fecha de nacimiento"
      name="birthDate"
    />
  );
}

describe("DateOnlyField", () => {
  test("renders a labelled date picker controlled by React Hook Form", () => {
    const markup = renderToStaticMarkup(<TestDateOnlyField />);

    expect(markup).toContain('for="birth-date"');
    expect(markup).toContain('id="birth-date"');
    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('value="2026-07-02"');
    expect(markup).toContain("2 de julio de 2026");
  });

  test("passes disabled to the trigger and renders the lock affordance", () => {
    const markup = renderToStaticMarkup(<TestDisabledDateOnlyField />);

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain("lucide-lock");
  });
});
