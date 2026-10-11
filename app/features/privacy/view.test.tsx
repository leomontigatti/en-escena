import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PrivacyPolicyView } from "./view";

describe("PrivacyPolicyView", () => {
  const markup = renderToStaticMarkup(<PrivacyPolicyView />);

  test("gives the address for access and deletion requests as a mail link", () => {
    expect(markup).toContain('href="mailto:certamen.enescena@gmail.com"');
  });
});
