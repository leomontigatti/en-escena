// @vitest-environment jsdom

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { TimeOnlyField } from "@/components/shared/time-only-field";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

type TestFormValues = {
  awardCeremonyTime: string;
};

function TestClearableTimeOnlyField({
  clearable,
  defaultValue = "22:30",
}: {
  clearable?: boolean;
  defaultValue?: string;
}) {
  const form = useForm<TestFormValues>({
    defaultValues: { awardCeremonyTime: defaultValue },
  });

  return (
    <TimeOnlyField
      clearable={clearable}
      control={form.control}
      label="Hora de entrega de premios"
      name="awardCeremonyTime"
    />
  );
}

function readTimeOnlyFieldValue() {
  return document.querySelector<HTMLInputElement>(
    'input[name="awardCeremonyTime"]',
  )?.value;
}

function findClearButton() {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Quitar hora",
  );
}

// An optional time needs a way back to empty: the hour and minute selects
// only ever produce a time.
describe("TimeOnlyField clear action", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("empties the value", async () => {
    await renderer.renderAsync(<TestClearableTimeOnlyField clearable />);

    await clickReactDomButton("22:30");
    await clickReactDomButton("Quitar hora");

    expect(readTimeOnlyFieldValue()).toBe("");
  });

  test("offers no clear action without the opt-in prop", async () => {
    await renderer.renderAsync(<TestClearableTimeOnlyField />);

    await clickReactDomButton("22:30");

    expect(findClearButton()).toBeUndefined();
  });

  test("offers no clear action while the value is empty", async () => {
    await renderer.renderAsync(
      <TestClearableTimeOnlyField clearable defaultValue="" />,
    );

    await clickReactDomButton("Seleccioná hora");

    expect(findClearButton()).toBeUndefined();
  });
});
