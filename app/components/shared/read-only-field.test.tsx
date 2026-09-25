import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ReadOnlyDateField,
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
});
