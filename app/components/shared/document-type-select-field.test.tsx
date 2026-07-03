import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { DocumentTypeSelectField } from "./document-type-select-field";

type TestFormValues = {
  documentType: string;
};

function TestDocumentTypeSelectField({
  value,
}: {
  value: TestFormValues["documentType"];
}) {
  const form = useForm<TestFormValues>({
    defaultValues: {
      documentType: value,
    },
  });

  return (
    <DocumentTypeSelectField
      control={form.control}
      id="document-type"
      name="documentType"
    />
  );
}

describe("DocumentTypeSelectField", () => {
  test("submits an empty value when the visible selection is no document", () => {
    const markup = renderToStaticMarkup(
      <TestDocumentTypeSelectField value="" />,
    );

    expect(markup).toContain('for="document-type"');
    expect(markup).toContain('name="documentType" value=""');
  });

  test("submits the selected document type value", () => {
    const markup = renderToStaticMarkup(
      <TestDocumentTypeSelectField value="dni" />,
    );

    expect(markup).toContain('name="documentType" value="dni"');
  });
});
