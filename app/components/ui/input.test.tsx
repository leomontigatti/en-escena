import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";

describe("form controls", () => {
  test("uses the brand color for input focus rings", () => {
    const markup = renderToStaticMarkup(<Input />);

    expect(markup).toContain("focus-visible:ring-brand/50");
    expect(markup).toContain("focus-visible:border-brand");
  });

  test("uses the brand color for textarea focus rings", () => {
    const markup = renderToStaticMarkup(<Textarea />);

    expect(markup).toContain("focus-visible:ring-brand/50");
    expect(markup).toContain("focus-visible:border-brand");
  });

  test("uses the brand color for grouped input focus rings", () => {
    const markup = renderToStaticMarkup(
      <InputGroup>
        <InputGroupInput />
      </InputGroup>,
    );

    expect(markup).toContain("focus-visible]:ring-brand/50");
    expect(markup).toContain("focus-visible]:border-brand");
  });
});
