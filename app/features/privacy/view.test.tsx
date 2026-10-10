import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PrivacyPolicyView } from "./view";

describe("PrivacyPolicyView", () => {
  const markup = renderToStaticMarkup(<PrivacyPolicyView />);

  test("says what the vote with Google keeps, and that the email is only hashed", () => {
    expect(markup).toContain("Política de privacidad");
    expect(markup).toContain("identificador de tu cuenta");
    expect(markup).toContain("nunca la dirección");
  });

  test("gives the address for access and deletion requests as a mail link", () => {
    expect(markup).toContain('href="mailto:certamen.enescena@gmail.com"');
  });
});
