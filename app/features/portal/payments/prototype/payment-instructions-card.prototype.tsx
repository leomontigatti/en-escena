// PROTOTYPE — throwaway. Answers wayfinder ticket #870: what the payment
// instructions card looks like on /portal/pagos. Not imported by production
// code; it dies with this branch once the decision is folded into the spec.
import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy, Landmark } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/shared/utils";

export type PrototypePaymentInstructions = {
  holderName: string | null;
  bankName: string | null;
  cbu: string | null;
  cvu: string | null;
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

function getCopyableFields(
  instructions: PrototypePaymentInstructions,
): CopyableField[] {
  return [
    { label: "CBU", value: instructions.cbu },
    { label: "CVU", value: instructions.cvu },
    { label: "Alias", value: instructions.alias },
  ].filter((field): field is CopyableField => Boolean(field.value));
}

function hasIdentifiers(instructions: PrototypePaymentInstructions) {
  return [
    instructions.cbu,
    instructions.cvu,
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

function linkify(paragraph: string): ReactNode[] {
  return paragraph.split(/(https?:\/\/\S+)/g).map((chunk, index) =>
    /^https?:\/\//.test(chunk) ? (
      <a
        key={index}
        href={chunk}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-3 hover:text-foreground"
      >
        {chunk}
      </a>
    ) : (
      chunk
    ),
  );
}

/**
 * The free text: paragraphs split on blank lines, single newlines preserved,
 * bare http(s) URLs turned into links. No markup language.
 */
function InstructionsText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/);

  return (
    <div className="flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {linkify(paragraph)}
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
 * The chosen shape: the definition grid of the Card variant, rendered inside
 * the info Alert the portal already uses for event-scoped notices.
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
      <AlertDescription className="flex flex-col gap-4">
        <p>Datos de la cuenta que recibe los pagos de este evento.</p>
        <InstructionsBody instructions={instructions} />
      </AlertDescription>
    </Alert>
  );
}

function IdentifierGrid({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
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
      {instructions.holderName ? (
        <IdentifierRow label="Titular">{instructions.holderName}</IdentifierRow>
      ) : null}
      {instructions.bankName ? (
        <IdentifierRow label="Banco">{instructions.bankName}</IdentifierRow>
      ) : null}
      {instructions.holderCuit ? (
        <IdentifierRow label="CUIT" className="tabular-nums">
          {formatCuitForDisplay(instructions.holderCuit)}
        </IdentifierRow>
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

/** Kept for comparison: the same grid on a neutral Card instead of the Alert. */
export function PaymentInstructionsCardVariant({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          Instrucciones de pago
        </CardTitle>
        <CardDescription>
          Datos de la cuenta que recibe los pagos de este evento.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InstructionsBody instructions={instructions} />
      </CardContent>
    </Card>
  );
}
