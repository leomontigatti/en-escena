// @vitest-environment jsdom

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { TimeOnlyField } from "@/components/shared/time-only-field";
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
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

describe("TimeOnlyField minutes", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("offers the minutes in five-minute steps", async () => {
    await renderer.renderAsync(<TestClearableTimeOnlyField />);

    await clickReactDomButton("22:30");
    await openTimePartSelect(1);

    expect(readSelectOptions()).toEqual([
      "00",
      "05",
      "10",
      "15",
      "20",
      "25",
      "30",
      "35",
      "40",
      "45",
      "50",
      "55",
    ]);
  });

  // A time saved before the steps existed keeps its minutes: changing only the
  // hour must not round them away.
  test("keeps a saved minute between steps when the hour changes", async () => {
    await renderer.renderAsync(
      <TestClearableTimeOnlyField defaultValue="22:07" />,
    );

    await clickReactDomButton("22:07");
    await openTimePartSelect(0);
    await selectRadixOption("10");

    expect(readTimeOnlyFieldValue()).toBe("10:07");
  });
});

/** The popover's selects, in order: the hour, then the minutes. */
function openTimePartSelect(index: 0 | 1) {
  return openRadixSelect(
    document.querySelectorAll('[data-slot="select-trigger"]')[index],
  );
}

function readSelectOptions() {
  return Array.from(
    document.querySelectorAll('[data-slot="select-item"]'),
    (option) => option.textContent?.trim(),
  );
}
