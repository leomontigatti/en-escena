import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PrivateAccessHeader } from "@/components/auth/access-ui";

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
