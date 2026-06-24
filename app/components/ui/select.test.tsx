import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

describe("SelectTrigger", () => {
  test("uses the brand color while open", () => {
    const markup = renderToStaticMarkup(
      <Select open value="danza-libre">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    expect(markup).toContain("data-[state=open]:border-brand");
    expect(markup).toContain("data-[state=open]:ring-brand/50");
  });
});
