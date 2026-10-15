import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { SelectField } from "@/components/shared/select-field";

type TestFormValues = {
  status: string;
};

function TestSelectField({
  error,
  value,
}: {
  error?: string;
  value: TestFormValues["status"];
}) {
  const form = useForm<TestFormValues>({
    defaultValues: {
      status: value,
    },
  });

  return (
    <SelectField
      allowEmpty
      control={form.control}
      emptyLabel="Sin estado"
      error={error}
      id="status"
      label="Estado"
      name="status"
      options={[{ value: "active", label: "Activo" }]}
    />
  );
}

describe("SelectField", () => {
  test("submits an empty value when the empty option is selected", () => {
    const markup = renderToStaticMarkup(<TestSelectField value="" />);

    expect(markup).toContain('for="status"');
    expect(markup).toContain('name="status" value=""');
  });

  test("submits the selected option value", () => {
    const markup = renderToStaticMarkup(<TestSelectField value="active" />);

    expect(markup).toContain('name="status" value="active"');
  });

  test("shows an error the form does not own as its own", () => {
    const markup = renderToStaticMarkup(
      <TestSelectField
        error="Ningún cronograma acepta esa modalidad."
        value="active"
      />,
    );

    expect(markup).toContain('data-invalid="true"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("Ningún cronograma acepta esa modalidad.");
  });
});
