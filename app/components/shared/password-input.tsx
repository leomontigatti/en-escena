import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PasswordInputProps = Omit<ComponentProps<typeof InputGroupInput>, "type">;

/**
 * A password box with a button that shows what was typed. The reveal is local
 * to the control and starts hidden on every mount, so a form that remounts its
 * fields never comes back with a password on screen.
 */
function PasswordInput(props: PasswordInputProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const toggleLabel = isRevealed ? "Ocultar contraseña" : "Mostrar contraseña";

  return (
    <InputGroup>
      <InputGroupInput type={isRevealed ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <InputGroupButton
                size="icon-xs"
                aria-pressed={isRevealed}
                onClick={() => setIsRevealed((revealed) => !revealed)}
              >
                {isRevealed ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
                <span className="sr-only">{toggleLabel}</span>
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>{toggleLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PasswordInput };
