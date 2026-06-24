import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  test("uses the brand color for the link variant", () => {
    const markup = renderToStaticMarkup(
      <Button variant="link">Ver detalle</Button>,
    );

    expect(markup).toContain("text-brand");
  });
});
