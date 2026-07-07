import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { MultiComboboxField } from "./multi-combobox-field";

type TestFormValues = {
  modalityIds: string[];
};

const modalityOptions = [
  { value: "salsa", label: "Salsa" },
  { value: "tango", label: "Tango" },
];

function TestMultiComboboxField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      modalityIds: ["salsa"],
    },
  });

  return (
    <MultiComboboxField
      control={form.control}
      description="Elegir una o mas modalidades."
      id="modality-ids"
      inputName="modalityIds"
      label="Modalidades"
      name="modalityIds"
      options={modalityOptions}
      placeholder="Seleccionar modalidades"
    />
  );
}

describe("MultiComboboxField", () => {
  test("renders through the shared field layout with submitted hidden values", () => {
    const markup = renderToStaticMarkup(<TestMultiComboboxField />);

    expect(markup).toContain('for="modality-ids"');
    expect(markup).toContain('id="modality-ids"');
    expect(markup).toContain('aria-describedby="modality-ids-description"');
    expect(markup).toContain('name="modalityIds"');
    expect(markup).toContain('value="salsa"');
    expect(markup).toContain("Modalidades");
    expect(markup).toContain("Elegir una o mas modalidades.");
  });
});
