import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { SelectField } from "@/components/shared/select-field";

type TestFormValues = {
  status: string;
};

function TestSelectField({ value }: { value: TestFormValues["status"] }) {
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
});
