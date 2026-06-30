import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { IntegerInput, getIntegerInputValue } from "./integer-input";

describe("IntegerInput", () => {
  test("renders a text input optimized for integer entry", () => {
    const markup = renderToStaticMarkup(<IntegerInput name="amount" />);

    expect(markup).toContain('type="text"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('pattern="[0-9]*"');
  });

  test("normalizes values to digits only", () => {
    expect(getIntegerInputValue("12e3 pesos")).toBe("123");
    expect(getIntegerInputValue("+54-351")).toBe("54351");
    expect(getIntegerInputValue("abc")).toBe("");
  });
});
