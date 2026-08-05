/**
 * THROWAWAY PROTOTYPE — ticket #623 (map #547).
 *
 * Three variants of where the "no price row applies" refusal lands in the portal
 * choreography creation flow, switchable via `?variant=A|B|C`, over three fixture
 * cases via `?caso=unico|parcial|ninguno`.
 *
 * The wizard chrome is copied from `create/dialog.tsx` so the variants are judged
 * inside the real dialog, at the real density, four steps into the flow.
 */
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";

import { prototypeCases } from "./fixtures";
import { PrototypeSwitcher, usePrototypeSelection } from "./switcher";
import { variantA } from "./variant-a";
import { variantB } from "./variant-b";
import { variantC } from "./variant-c";
import { usePrototypeWizard, type PrototypeVariant } from "./wizard";

const variants: Record<string, PrototypeVariant> = {
  A: variantA,
  B: variantB,
  C: variantC,
};

export function PriceRefusalPrototypeView() {
  const { variant, caseKey, select } = usePrototypeSelection();

  return (
    <PriceRefusalPrototypeDialog
      // Remounting on case change keeps the fixture and the step index in sync.
      key={caseKey}
      caseKey={caseKey}
      variantKey={variant}
      onSelect={select}
    />
  );
}

function PriceRefusalPrototypeDialog({
  caseKey,
  variantKey,
  onSelect,
}: {
  caseKey: Parameters<typeof usePrototypeWizard>[0];
  variantKey: string;
  onSelect: Parameters<typeof PrototypeSwitcher>[0]["onSelect"];
}) {
  const wizard = usePrototypeWizard(caseKey);
  const variant = variants[variantKey] ?? variantA;
  const { Body } = variant;

  const isFirstStep = wizard.currentStep === "dancers";
  const variantFooter = variant.footer?.(wizard) ?? null;

  return (
    <Dialog open>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-visible"
        overlayClassName="backdrop-blur-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Nueva coreografía</DialogTitle>
          <DialogDescription>
            Completá los siguientes pasos para registrarla en el evento.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-col gap-6 overflow-y-auto px-1">
          <Field>
            <div className="flex justify-end">
              <span className="text-sm text-muted-foreground">
                Paso {wizard.stepNumber} de {wizard.totalSteps}
              </span>
            </div>
            <Progress value={wizard.progressValue} />
          </Field>

          <div className="flex flex-col gap-6">
            <Body wizard={wizard} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (wizard.resolutionRefused) {
                wizard.dismissRefusal();
                return;
              }
              wizard.goPrevious();
            }}
          >
            {isFirstStep && !wizard.resolutionRefused ? null : (
              <ChevronLeft aria-hidden="true" data-icon />
            )}
            {isFirstStep && !wizard.resolutionRefused ? "Cancelar" : "Anterior"}
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {variantFooter ?? <DefaultFooterAction wizard={wizard} />}
          </div>
        </DialogFooter>

        <PrototypeSwitcher
          variant={variantKey as "A" | "B" | "C"}
          caseKey={caseKey}
          onSelect={onSelect}
        />

        <p className="fixed bottom-1 left-1/2 -translate-x-1/2 text-center text-xs text-muted-foreground">
          {prototypeCases[caseKey].description}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function DefaultFooterAction({
  wizard,
}: {
  wizard: ReturnType<typeof usePrototypeWizard>;
}) {
  if (wizard.currentStep === "summary") {
    return (
      <Button type="button">
        <Check aria-hidden="true" data-icon />
        Guardar
      </Button>
    );
  }

  return (
    <Button type="button" disabled={!wizard.canAdvance} onClick={wizard.goNext}>
      Siguiente
      <ChevronRight aria-hidden="true" data-icon />
    </Button>
  );
}
