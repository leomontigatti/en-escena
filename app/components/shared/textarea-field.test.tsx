import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { TextareaField } from "./textarea-field";

function TestTextareaField({ disabled }: { disabled: boolean }) {
  const form = useForm<{ notes: string }>({
    defaultValues: { notes: "Sin observaciones" },
  });

  return (
    <TextareaField
      control={form.control}
      disabled={disabled}
      id="notes"
      label="Nota interna"
      name="notes"
    />
  );
}

describe("TextareaField", () => {
  test("draws the lock icon when disabled, like every other shared field", () => {
    const markup = renderToStaticMarkup(<TestTextareaField disabled />);

    expect(markup).toContain("lucide-lock");
    expect(markup).toMatch(/<textarea[^>]*disabled/);
  });

  test("draws no lock icon while editable", () => {
    const markup = renderToStaticMarkup(<TestTextareaField disabled={false} />);

    expect(markup).not.toContain("lucide-lock");
  });
});
