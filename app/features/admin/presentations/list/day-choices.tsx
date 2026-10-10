import { useId } from "react";

import { ChoiceCard } from "@/components/shared/choice-card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";

/**
 * The event's days as checkbox cards, for the dialogs of the list that act on
 * some of them. The days are few — one per day of the event — so they are
 * drawn in place rather than through `ChecklistField`, whose search and
 * `Seleccionados` tab are for long lists. The value stays in date order.
 */
export function DayChoices({
  days,
  disabled,
  onChange,
  value,
}: {
  days: string[];
  disabled?: boolean;
  onChange: (days: string[]) => void;
  value: string[];
}) {
  const id = useId();

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {days.map((day) => (
        <ChoiceCard
          key={day}
          disabled={disabled}
          htmlFor={`${id}-${day}`}
          label={formatScheduleDayTabLabel(day)}
        >
          <Checkbox
            id={`${id}-${day}`}
            checked={value.includes(day)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(
                checked === true
                  ? [...value, day].sort()
                  : value.filter((chosen) => chosen !== day),
              )
            }
          />
        </ChoiceCard>
      ))}
    </div>
  );
}
