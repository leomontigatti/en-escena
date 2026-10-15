import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";

describe("ReadOnlyField", () => {
  test("renders a locked date field with a formatted display value", () => {
    const markup = renderToStaticMarkup(
      <ReadOnlyDateField
        id="birth-date"
        label="Fecha de nacimiento"
        name="birthDate"
        value="2026-05-01"
      />,
    );

    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('value="2026-05-01"');
    expect(markup).toContain('value="1 de mayo de 2026"');
  });

  test("renders a locked select field with the selected option label", () => {
    const markup = renderToStaticMarkup(
      <ReadOnlySelectField
        id="document-type"
        label="Tipo de documento"
        name="documentType"
        value="dni"
        options={[{ value: "dni", label: "DNI" }]}
      />,
    );

    expect(markup).toContain('name="documentType"');
    expect(markup).toContain('value="dni"');
    expect(markup).toContain('value="DNI"');
  });

  // A value derived from other fields can be wrong without the user being able
  // to type into it: the reason still has to read as this field's error.
  test("marks a locked field invalid when it carries an error", () => {
    const markup = renderToStaticMarkup(
      <ReadOnlyField
        error="Con este elenco no existe una categoría válida."
        id="category"
        label="Categoría"
        value=""
      />,
    );

    expect(markup).toContain('data-invalid="true"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="category-error"');
    expect(markup).toContain("Con este elenco no existe una categoría válida.");
  });
});
