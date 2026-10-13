// PROTOTYPE optional-level, wipe me. The category step's level picker with "Sin nivel".
// The no-level choice lives in memory (a context from the page) and is never written to the form's
// submitted fields: the level field is only set to "" for it, which is what an unanswered level already is.
import { createContext, useContext, useState, type ReactNode } from "react";

import { ChoiceCard } from "@/components/shared/choice-card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldTitle } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { CreateChoreographyForm } from "@/features/portal/choreographies/create/flow";
import {
  experienceLevelLabels,
  experienceLevelOrder,
} from "@/lib/events/experience-levels";

// PROTOTYPE optional-level
const NONE = "__no-compite__";

// PROTOTYPE optional-level
type NoLevelState = { noLevel: boolean; setNoLevel: (value: boolean) => void };

// PROTOTYPE optional-level
const PrototypeNoLevelContext = createContext<NoLevelState | null>(null);

// PROTOTYPE optional-level
export function PrototypeNoLevelProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [noLevel, setNoLevel] = useState(false);
  return (
    <PrototypeNoLevelContext.Provider value={{ noLevel, setNoLevel }}>
      {children}
    </PrototypeNoLevelContext.Provider>
  );
}

// PROTOTYPE optional-level
export function usePrototypeNoLevel(): NoLevelState | null {
  return useContext(PrototypeNoLevelContext);
}

/**
 * The level choices the picker offers: the resolution's own levels when the
 * category declares some, otherwise the real levels of the enum (the dev seed's
 * categories declare none, so the step would have nothing to pick).
 */
// PROTOTYPE optional-level
export function prototypeLevelOptions(resolution: {
  experienceLevel: { options: { id: string; name: string }[] };
}): { id: string; name: string }[] {
  return resolution.experienceLevel.options.length > 0
    ? resolution.experienceLevel.options
    : experienceLevelOrder.map((value) => ({
        id: value,
        name: experienceLevelLabels[value] ?? value,
      }));
}

// PROTOTYPE optional-level
export function PrototypeLevelStep({
  form,
  levels,
  variant,
}: {
  form: CreateChoreographyForm;
  levels: { id: string; name: string }[];
  variant: string;
}) {
  const noLevelState = usePrototypeNoLevel();
  const noLevel = noLevelState?.noLevel ?? false;
  const levelId = form.watch("experienceLevelId") ?? "";
  const picked = noLevel ? "" : levelId;

  function chooseLevel(id: string) {
    noLevelState?.setNoLevel(false);
    form.setValue("experienceLevelId", id, { shouldDirty: true });
  }

  function chooseNone() {
    noLevelState?.setNoLevel(true);
    form.setValue("experienceLevelId", "", { shouldDirty: true });
  }

  if (variant === "B") {
    return (
      <div className="flex flex-col gap-2">
        <FieldTitle>Nivel de experiencia</FieldTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {levels.map((level) => (
            <ChoiceCard
              key={level.id}
              htmlFor={`nivel-b-${level.id}`}
              label={level.name}
            >
              <Checkbox
                id={`nivel-b-${level.id}`}
                checked={picked === level.id}
                onCheckedChange={(checked) =>
                  checked === true ? chooseLevel(level.id) : chooseNone()
                }
              />
            </ChoiceCard>
          ))}
        </div>
        <FieldDescription>
          Tocá un nivel para elegirlo; tocalo de nuevo para quitarlo y dejarlo
          en Sin nivel. Sin tocar ninguno, el paso sigue pendiente.
        </FieldDescription>
      </div>
    );
  }

  if (variant === "C") {
    return (
      <div className="flex flex-col gap-2">
        <FieldTitle>Nivel de experiencia</FieldTitle>
        <Label className="flex items-start gap-3 border p-3 font-normal">
          <Checkbox
            checked={noLevel}
            onCheckedChange={(checked) =>
              checked === true ? chooseNone() : noLevelState?.setNoLevel(false)
            }
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Sin nivel</span>
            <span className="text-xs text-muted-foreground">
              Se puntúa con un único valor de 0 a 100, sin planilla.
            </span>
          </span>
        </Label>
        <RadioGroup
          className="sm:grid-cols-2"
          value={picked}
          onValueChange={chooseLevel}
          disabled={noLevel}
        >
          {levels.map((level) => (
            <ChoiceCard
              key={level.id}
              disabled={noLevel}
              htmlFor={`nivel-c-${level.id}`}
              label={level.name}
            >
              <RadioGroupItem
                id={`nivel-c-${level.id}`}
                value={level.id}
                disabled={noLevel}
              />
            </ChoiceCard>
          ))}
        </RadioGroup>
      </div>
    );
  }

  // A: "Sin nivel" is one more card in the same group.
  return (
    <div className="flex flex-col gap-2">
      <FieldTitle>Nivel de experiencia</FieldTitle>
      <RadioGroup
        className="sm:grid-cols-2"
        value={noLevel ? NONE : picked}
        onValueChange={(value) =>
          value === NONE ? chooseNone() : chooseLevel(value)
        }
      >
        {levels.map((level) => (
          <ChoiceCard
            key={level.id}
            htmlFor={`nivel-a-${level.id}`}
            label={level.name}
          >
            <RadioGroupItem id={`nivel-a-${level.id}`} value={level.id} />
          </ChoiceCard>
        ))}
        <ChoiceCard htmlFor={`nivel-a-${NONE}`} label="Sin nivel">
          <RadioGroupItem id={`nivel-a-${NONE}`} value={NONE} />
        </ChoiceCard>
      </RadioGroup>
    </div>
  );
}
