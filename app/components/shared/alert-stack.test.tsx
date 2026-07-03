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

  test("stacks rendered alerts with the shared spacing", () => {
    const markup = renderToStaticMarkup(
      <AlertStack className="md:col-span-2">
        <div>Visible alert</div>
      </AlertStack>,
    );

    expect(markup).toContain('class="flex flex-col gap-3 md:col-span-2"');
    expect(markup).toContain("Visible alert");
  });
});
