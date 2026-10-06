import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/shared/utils";

const professionalEvaluationLabel = "Evaluar como profesional";

/**
 * The room an input leaves at its right end for a `field` switch, one step per
 * label tier below, so the value never runs under it.
 */
const professionalEvaluationFieldInputClassName = "pr-20 @2xs:pr-40 @md:pr-64";

type ProfessionalEvaluationSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  /**
   * Where the switch sits, which decides how its label gives way as the room
   * narrows; the `@container` is the nearest ancestor that owns the width.
   *
   * - `summary`: the right end of a row. Inline from `@md`; below it the short
   *   label stacks over the switch so the row's value keeps its width.
   * - `field`: the right end of an input. Full label from `@md` (448px), short
   *   from `@2xs` (288px), the switch alone below that so the value is never
   *   covered — which happens at tablet width with the sidebar open.
   */
  placement: "summary" | "field";
  onBlur?: () => void;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * `Evaluar como profesional`: the one editable thing beside a choreography's
 * category, on the wizard's summary and on both detail forms. Whichever text
 * the room allows, the accessible name is the whole label.
 */
function ProfessionalEvaluationSwitch({
  checked,
  disabled = false,
  placement,
  onBlur,
  onCheckedChange,
}: ProfessionalEvaluationSwitchProps) {
  const id = useId();
  const isField = placement === "field";

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        placement === "summary" &&
          "flex-col items-end gap-1 @md:flex-row @md:items-center @md:gap-2",
      )}
    >
      <Label
        aria-hidden="true"
        className={cn(isField && "hidden @2xs:flex")}
        htmlFor={id}
      >
        <span className="@md:hidden">Profesional</span>
        <span className="hidden @md:inline">{professionalEvaluationLabel}</span>
      </Label>
      <Switch
        aria-label={professionalEvaluationLabel}
        checked={checked}
        disabled={disabled}
        id={id}
        onBlur={onBlur}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export {
  ProfessionalEvaluationSwitch,
  professionalEvaluationFieldInputClassName,
};
