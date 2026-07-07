import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
  ReadOnlyTextareaField,
} from "@/components/shared/read-only-field";

describe("ReadOnlyField", () => {
  test("renders a locked input with an optional hidden submitted value", () => {
    const markup = renderToStaticMarkup(
      <ReadOnlyField
        id="birth-date"
        label="Fecha de nacimiento"
        name="birthDate"
        value="2026-05-01"
        displayValue="01/05/2026"
      />,
    );

    expect(markup).toContain('for="birth-date"');
    expect(markup).toContain('value="01/05/2026"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('value="2026-05-01"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain("lucide-lock");
  });

  test("renders locked long-form text", () => {
    const markup = renderToStaticMarkup(
      <ReadOnlyTextareaField
        id="payment-notes"
        label="Notas"
        value="Pago acreditado por transferencia."
      />,
    );

    expect(markup).toContain('for="payment-notes"');
    expect(markup).toContain("Pago acreditado por transferencia.");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain("lucide-lock");
  });

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
