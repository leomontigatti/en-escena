import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  AccessHeader,
  AccessTextLink,
  PrivateAccessHeader,
} from "@/components/auth/access-ui";

describe("AccessHeader", () => {
  test("can render media above the title without an eyebrow", () => {
    const markup = renderToStaticMarkup(
      <AccessHeader
        className="text-center"
        media={
          <span className="size-48 overflow-hidden rounded-full">
            <img src="/en-escena-certamen-de-danzas.png" alt="En Escena" />
          </span>
        }
        title="Ingresar"
      />,
    );

    expect(markup).toContain('src="/en-escena-certamen-de-danzas.png"');
    expect(markup).toContain('class="text-center"');
    expect(markup).toContain("size-48");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("Ingresar");
    expect(markup).not.toContain("Accedé al portal");
  });
});

describe("AccessTextLink", () => {
  test("uses the brand color", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AccessTextLink to="/ingresar">Ingresar</AccessTextLink>
      </MemoryRouter>,
    );

    expect(markup).toContain("text-brand");
  });
});

describe("PrivateAccessHeader", () => {
  test("renders the signed-in email and a POST logout action", () => {
    const markup = renderToStaticMarkup(
      <PrivateAccessHeader email="usuario@example.com" />,
    );

    expect(markup).toContain("usuario@example.com");
    expect(markup).toContain("<span>Salir</span>");
    expect(markup).toContain('action="/salir"');
    expect(markup).toContain('method="post"');
  });
});
