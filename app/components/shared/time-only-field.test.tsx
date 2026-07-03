import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { TimeOnlyField, parseTimeOnlyValue } from "./time-only-field";

type TestFormValues = {
  startTime: string;
};

function TestTimeOnlyField() {
  const form = useForm<TestFormValues>({
    defaultValues: {
      startTime: "09:30",
    },
  });

  return (
    <TimeOnlyField
      control={form.control}
      id="start-time"
      label="Hora"
      name="startTime"
    />
  );
}

describe("TimeOnlyField", () => {
  test("renders a labelled time picker controlled by React Hook Form", () => {
    const markup = renderToStaticMarkup(<TestTimeOnlyField />);

    expect(markup).toContain('for="start-time"');
    expect(markup).toContain('id="start-time"');
    expect(markup).toContain('name="startTime"');
    expect(markup).toContain('value="09:30"');
    expect(markup).toContain("09:30");
  });
});

describe("parseTimeOnlyValue", () => {
  test("keeps only valid hour and minute values", () => {
    const options = {
      hourOptions: ["09", "10"],
      minuteOptions: ["00", "30"],
    };

    expect(parseTimeOnlyValue("09:30", options)).toEqual({
      hour: "09",
      minute: "30",
    });
    expect(parseTimeOnlyValue("25:61", options)).toEqual({
      hour: undefined,
      minute: undefined,
    });
  });
});
