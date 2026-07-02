import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { TextInputField } from "./text-input-field";

type TestFormValues = {
  name: string;
};

function TestTextInputField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      name: "Ada",
    },
  });

  return (
    <TextInputField
      autoComplete="given-name"
      control={form.control}
      description="Usá el nombre que figura en el documento."
      id="person-name"
      label="Nombre"
      name="name"
    />
  );
}

describe("TextInputField", () => {
  test("renders a labelled input controlled by React Hook Form", () => {
    const markup = renderToStaticMarkup(<TestTextInputField />);

    expect(markup).toContain('for="person-name"');
    expect(markup).toContain('id="person-name"');
    expect(markup).toContain('name="name"');
    expect(markup).toContain('value="Ada"');
    expect(markup).toContain('autoComplete="given-name"');
    expect(markup).toContain("Usá el nombre que figura en el documento.");
  });
});
