import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { DataTableLink } from "@/components/shared/data-table-link";

describe("DataTableLink", () => {
  test("renders a brand-colored table link", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DataTableLink to="/detalle">Ver detalle</DataTableLink>
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/detalle"');
    expect(markup).toContain("text-brand");
  });
});
