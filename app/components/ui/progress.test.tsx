import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Progress } from "@/components/ui/progress";

describe("Progress", () => {
  test("uses the brand color for the progress indicator", () => {
    const markup = renderToStaticMarkup(<Progress value={20} />);

    expect(markup).toContain("bg-brand");
  });
});
