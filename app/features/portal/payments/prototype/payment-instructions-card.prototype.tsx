// PROTOTYPE — throwaway. Answers wayfinder ticket #870: what the payment
// instructions card looks like on /portal/pagos. Not imported by production
// code; it dies with this branch once the decision is folded into the spec.
import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy, Landmark } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/shared/utils";

export type PrototypePaymentInstructions = {
  holderName: string | null;
  bankName: string | null;
  /** One field: an account is reached by a CBU or by a CVU, never by both. */
  cbu: string | null;
  alias: string | null;
  holderCuit: string | null;
  text: string | null;
};

type CopyableField = {
  label: string;
  /**
   * A CBU and a CVU are 22 digits in a single run, not a card number: no
   * grouping, so what is read is exactly what is copied and what a payer
   * types.
   */
  value: string;
};

/** `20123456789` -> `20-12345678-9`. */
function formatCuitForDisplay(cuit: string) {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

/** `En Escena Producciones SRL · CUIT 30-71234567-4`, dropping what is absent. */
function formatHolderLine(instructions: PrototypePaymentInstructions) {
  return [
    instructions.holderName,
    instructions.holderCuit
      ? `CUIT ${formatCuitForDisplay(instructions.holderCuit)}`
      : null,
  ]
    .filter((part) => Boolean(part))
    .join(" · ");
}

function getCopyableFields(
  instructions: PrototypePaymentInstructions,
): CopyableField[] {
  return [
    { label: "CBU/CVU", value: instructions.cbu },
    { label: "Alias", value: instructions.alias },
  ].filter((field): field is CopyableField => Boolean(field.value));
}

function hasIdentifiers(instructions: PrototypePaymentInstructions) {
  return [
    instructions.cbu,
    instructions.alias,
    instructions.holderName,
    instructions.bankName,
    instructions.holderCuit,
  ].some((value) => Boolean(value));
}

function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false);

  function copy(value: string) {
    void navigator.clipboard.writeText(value);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 2000);
  }

  return { isCopied, copy };
}

function CopyIconButton({ label, value }: { label: string; value: string }) {
  const { isCopied, copy } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isCopied ? `${label} copiado` : `Copiar ${label}`}
      onClick={() => copy(value)}
    >
      {isCopied ? (
        <Check aria-hidden="true" className="text-success" />
      ) : (
        <Copy aria-hidden="true" />
      )}
    </Button>
  );
}

/**
 * The free text: paragraphs split on blank lines, single newlines preserved,
 * and nothing else. No markup language and no autolinking — a URL renders as
 * the characters it is, so whether a payment link deserves its own field stays
 * an open question rather than being answered by the renderer.
 */
function InstructionsText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/);

  return (
    <div className="flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function IdentifierRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", className)}>{children}</dd>
    </div>
  );
}

/**
 * The chosen shape: a definition grid inside the info Alert the portal already
 * uses for event-scoped notices. No lead sentence — the title says it.
 */
export function PaymentInstructionsAlertGridVariant({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  return (
    <Alert variant="info">
      <Landmark aria-hidden="true" />
      <AlertTitle>Instrucciones de pago</AlertTitle>
      {/* `mt-2` because the alert's own row gap is 0.5, which crowds a grid. */}
      <AlertDescription className="mt-2 flex flex-col gap-4">
        <InstructionsBody instructions={instructions} />
      </AlertDescription>
    </Alert>
  );
}

/**
 * Two columns from `sm`: CBU/CVU beside the alias, then titular beside banco.
 * The titular cell carries the CUIT, since a payer reads them together on the
 * bank's confirmation screen.
 */
function IdentifierGrid({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  const holderLine = formatHolderLine(instructions);

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {getCopyableFields(instructions).map((field) => (
        <div key={field.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {field.label}
          </dt>
          <dd className="flex items-center gap-1">
            <span className="font-mono text-sm tabular-nums text-foreground">
              {field.value}
            </span>
            <CopyIconButton label={field.label} value={field.value} />
          </dd>
        </div>
      ))}
      {holderLine ? (
        <IdentifierRow label="Titular">{holderLine}</IdentifierRow>
      ) : null}
      {instructions.bankName ? (
        <IdentifierRow label="Banco">{instructions.bankName}</IdentifierRow>
      ) : null}
    </dl>
  );
}

function InstructionsBody({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  const text = instructions.text;
  const blocks: ReactNode[] = [];

  if (hasIdentifiers(instructions)) {
    blocks.push(<IdentifierGrid instructions={instructions} />);
  }

  if (text) {
    blocks.push(<InstructionsText text={text} />);
  }

  // A separator only where two blocks actually meet.
  return blocks.map((block, index) => (
    <Fragment key={index}>
      {index > 0 ? <Separator /> : null}
      {block}
    </Fragment>
  ));
}
