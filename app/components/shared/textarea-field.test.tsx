import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { TextareaField } from "./textarea-field";

type TestFormValues = {
  note: string;
};

function TestTextareaField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      note: "Detalle interno",
    },
  });

  return (
    <TextareaField
      control={form.control}
      description="Visible solo para administración."
      id="internal-note"
      label="Nota interna"
      name="note"
    />
  );
}

describe("TextareaField", () => {
  test("renders a labelled textarea controlled by React Hook Form", () => {
    const markup = renderToStaticMarkup(<TestTextareaField />);

    expect(markup).toContain('for="internal-note"');
    expect(markup).toContain('id="internal-note"');
    expect(markup).toContain('name="note"');
    expect(markup).toContain("Detalle interno");
    expect(markup).toContain("Visible solo para administración.");
  });
});
