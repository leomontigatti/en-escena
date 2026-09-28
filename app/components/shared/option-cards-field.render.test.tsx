/** @vitest-environment jsdom */

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { OptionCardsField } from "./option-cards-field";
import {
  createReactDomTestRenderer,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

let chosenSchedule = "";

function ScheduleCards() {
  const form = useForm({ defaultValues: { scheduleCapacityId: "" } });
  chosenSchedule = form.watch("scheduleCapacityId");

  return (
    <OptionCardsField
      control={form.control}
      label="Cronograma"
      name="scheduleCapacityId"
      options={[
        { value: "morning", label: "Sábado 14 · mañana" },
        { value: "afternoon", label: "Sábado 14 · tarde", disabled: true },
        { value: "sunday", label: "Domingo 15 · tarde" },
      ]}
    />
  );
}

async function clickCard(label: string) {
  const card = Array.from(
    document.querySelectorAll<HTMLLabelElement>("label"),
  ).find((candidate) => candidate.textContent === label);

  await updateReactDomForm(() => {
    card?.click();
  });
}

describe("OptionCardsField", () => {
  test("chooses one option at a time by tapping its card", async () => {
    await renderer.renderAsync(<ScheduleCards />);

    await clickCard("Sábado 14 · mañana");
    expect(chosenSchedule).toBe("morning");

    await clickCard("Domingo 15 · tarde");
    expect(chosenSchedule).toBe("sunday");
    expect(
      document.querySelectorAll('[role="radio"][aria-checked="true"]'),
    ).toHaveLength(1);
  });

  test("never chooses a disabled option", async () => {
    await renderer.renderAsync(<ScheduleCards />);

    await clickCard("Sábado 14 · tarde");

    expect(chosenSchedule).toBe("");
  });

  test("names the group by its label", async () => {
    await renderer.renderAsync(<ScheduleCards />);

    const group = document.querySelector('[role="radiogroup"]');
    const labelledBy = group?.getAttribute("aria-labelledby") ?? "";

    expect(document.getElementById(labelledBy)?.textContent).toBe("Cronograma");
  });
});
