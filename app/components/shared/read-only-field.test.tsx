import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ReadOnlyField,
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
});
