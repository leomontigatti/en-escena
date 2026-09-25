import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AlertStack } from "@/components/shared/alert-stack";

describe("AlertStack", () => {
  test("does not render an empty wrapper for empty children", () => {
    const markup = renderToStaticMarkup(
      <AlertStack className="md:col-span-2">
        {false ? <div>Hidden alert</div> : null}
        {null}
      </AlertStack>,
    );

    expect(markup).toBe("");
  });
});
