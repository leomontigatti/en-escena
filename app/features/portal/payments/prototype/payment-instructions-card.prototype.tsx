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
  alias: string | null;
  holderCuit: string | null;
  text: string | null;
};

type CopyableField = {
  label: string;
  /** What the academy reads on screen: grouped for the eye. */
  display: string;
  /** What lands on the clipboard: exactly what home banking expects. */
  copyValue: string;
};

/** `0170099920000000000004` -> `0170 0999 2000 0000 0000 04`. */
function formatCbuForDisplay(cbu: string) {
  return cbu.replace(/(.{4})/g, "$1 ").trim();
}

/** `20123456789` -> `20-12345678-9`. */
function formatCuitForDisplay(cuit: string) {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

function getCopyableFields(
  instructions: PrototypePaymentInstructions,
): CopyableField[] {
  const fields: CopyableField[] = [];

  if (instructions.cbu) {
    fields.push({
      label: "CBU",
      display: formatCbuForDisplay(instructions.cbu),
      copyValue: instructions.cbu,
    });
  }

  if (instructions.alias) {
    fields.push({
      label: "Alias",
      display: instructions.alias,
      copyValue: instructions.alias,
    });
  }

  return fields;
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

/** `Titular · Banco · CUIT`, skipping whatever is not loaded. */
function formatHolderLine(instructions: PrototypePaymentInstructions) {
  return [
    instructions.holderName,
    instructions.bankName,
    instructions.holderCuit
      ? `CUIT ${formatCuitForDisplay(instructions.holderCuit)}`
      : null,
  ]
    .filter((part) => Boolean(part))
    .join(" · ");
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

function CopyTextButton({ label, value }: { label: string; value: string }) {
  const { isCopied, copy } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => copy(value)}
    >
      {isCopied ? (
        <Check data-icon="inline-start" aria-hidden="true" />
      ) : (
        <Copy data-icon="inline-start" aria-hidden="true" />
      )}
      {isCopied ? "Copiado" : `Copiar ${label.toLowerCase()}`}
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

function InlineIdentifierList({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  const holderLine = formatHolderLine(instructions);

  return (
    <dl className="flex flex-col gap-2">
      {getCopyableFields(instructions).map((field) => (
        <div
          key={field.label}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
        >
          <dt className="text-xs font-medium">{field.label}</dt>
          <dd className="font-mono text-sm tabular-nums text-foreground">
            {field.display}
          </dd>
          <CopyIconButton label={field.label} value={field.copyValue} />
        </div>
      ))}
      {holderLine ? (
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-xs font-medium">Titular</dt>
          <dd className="text-sm text-foreground">{holderLine}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Variant A — the page's existing callout primitive, one info block. */
export function PaymentInstructionsAlertVariant({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  return (
    <Alert variant="info">
      <Landmark aria-hidden="true" />
      <AlertTitle>Instrucciones de pago</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>Transferí a esta cuenta y avisá a administración.</p>
        {hasIdentifiers(instructions) ? (
          <InlineIdentifierList instructions={instructions} />
        ) : null}
        {instructions.text ? (
          <InstructionsText text={instructions.text} />
        ) : null}
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
            <span className="font-mono text-sm tabular-nums">
              {field.display}
            </span>
            <CopyIconButton label={field.label} value={field.copyValue} />
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

function CardBody({
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

/** Variant B — Card, full composition, identifiers as a definition grid. */
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
        <CardBody instructions={instructions} />
      </CardContent>
    </Card>
  );
}

/** Variant C — Card where pasting is the hero: full-width copy buttons. */
export function PaymentInstructionsPasteFirstVariant({
  instructions,
}: {
  instructions: PrototypePaymentInstructions;
}) {
  const copyableFields = getCopyableFields(instructions);
  const holderLine = formatHolderLine(instructions);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instrucciones de pago</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {copyableFields.map((field) => (
          <div
            key={field.label}
            className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {field.label}
              </span>
              <span className="font-mono text-base tabular-nums">
                {field.display}
              </span>
            </div>
            <CopyTextButton label={field.label} value={field.copyValue} />
          </div>
        ))}
        {holderLine ? (
          <p className="text-xs text-muted-foreground">{holderLine}</p>
        ) : null}
        {instructions.text ? (
          <InstructionsText text={instructions.text} />
        ) : null}
      </CardContent>
    </Card>
  );
}
