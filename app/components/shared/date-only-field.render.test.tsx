// @vitest-environment jsdom

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

type TestFormValues = {
  birthDate: string;
};

function TestDateOnlyField({
  defaultMonth,
  latestSelectableDate,
}: {
  defaultMonth?: Date;
  latestSelectableDate?: Date;
}) {
  const form = useForm<TestFormValues>({
    defaultValues: { birthDate: "" },
  });

  return (
    <DateOnlyField
      control={form.control}
      calendarBounds={{
        defaultMonth,
        endMonth: new Date(2025, 8),
        startMonth: new Date(1900, 0),
        latestSelectableDate,
      }}
      id="birth-date"
      label="Fecha de nacimiento"
      name="birthDate"
    />
  );
}

describe("DateOnlyField calendar months", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("opens the calendar on the default month", async () => {
    await renderer.renderAsync(
      <TestDateOnlyField defaultMonth={new Date(2014, 8)} />,
    );

    await clickReactDomButton("Elegí fecha");

    expect(readSelectedDropdownValues()).toEqual(["8", "2014"]);
  });

  test("offers no month after the end month", async () => {
    await renderer.renderAsync(
      <TestDateOnlyField defaultMonth={new Date(2014, 8)} />,
    );

    await clickReactDomButton("Elegí fecha");

    const years = readYearOptions();

    expect(years.at(-1)).toBe("2025");
    expect(years).not.toContain("2026");
  });

  test("offers no day after the latest selectable date", async () => {
    await renderer.renderAsync(
      <TestDateOnlyField
        defaultMonth={new Date(2025, 8)}
        latestSelectableDate={new Date(2025, 8, 25)}
      />,
    );

    await clickReactDomButton("Elegí fecha");

    // The end month still shows the whole month, so the bound only holds if the
    // days past it are unclickable: that is the mismatch the day bound closes.
    expect(isSeptember2025DayDisabled(25)).toBe(false);
    expect(isSeptember2025DayDisabled(26)).toBe(true);
    expect(isSeptember2025DayDisabled(30)).toBe(true);
  });

  test("opens on the end month when no default month is given", async () => {
    await renderer.renderAsync(<TestDateOnlyField />);

    await clickReactDomButton("Elegí fecha");

    expect(readSelectedDropdownValues()).toEqual(["8", "2025"]);
  });
});

function isSeptember2025DayDisabled(day: number) {
  const dayButton = document.querySelector<HTMLButtonElement>(
    `button[data-day="${day}/9/2025"]`,
  );

  if (!dayButton) {
    throw new Error(`The calendar offers no ${day} September 2025.`);
  }

  return dayButton.disabled;
}

function readDropdowns() {
  return Array.from(document.querySelectorAll("select"));
}

function readSelectedDropdownValues() {
  return readDropdowns().map((dropdown) => dropdown.value);
}

function readYearOptions() {
  const yearDropdown = readDropdowns().at(-1);

  return Array.from(yearDropdown?.options ?? []).map((option) => option.value);
}
