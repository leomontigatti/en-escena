import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Landmark } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  formatPaymentHolderLine,
  hasPaymentIdentifiers,
  type PaymentInstructions,
} from "@/lib/finances/payment-instructions";
import { cn } from "@/lib/shared/utils";

/** How long the copy button shows its confirmation before reverting. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * The event's `Instrucciones de pago` on `/portal/pagos`: the info note the
 * portal already uses for event-scoped notices, holding a definition grid of
 * the bank identifiers and the free text. The portal stays read-only —
 * administration still registers every payment.
 */
export function PaymentInstructionsAlert({
  instructions,
}: {
  instructions: PaymentInstructions;
}) {
  return (
    <Alert variant="info">
      <Landmark aria-hidden="true" />
      <AlertTitle>Instrucciones de pago</AlertTitle>
      {/* `mt-2`: the alert's own row gap suits a one-line notice and crowds a grid. */}
      <AlertDescription className="mt-2 flex flex-col gap-4">
        <PaymentInstructionsBody instructions={instructions} />
      </AlertDescription>
    </Alert>
  );
}

function PaymentInstructionsBody({
  instructions,
}: {
  instructions: PaymentInstructions;
}) {
  const blocks: ReactNode[] = [];

  if (hasPaymentIdentifiers(instructions)) {
    blocks.push(<IdentifierGrid instructions={instructions} />);
  }

  if (instructions.text) {
    blocks.push(<InstructionsText text={instructions.text} />);
  }

  // A separator only where two blocks actually meet.
  return blocks.map((block, index) => (
    <Fragment key={index}>
      {index > 0 ? <Separator /> : null}
      {block}
    </Fragment>
  ));
}

/**
 * Two columns from `sm`: the CBU/CVU beside the alias, then the titular beside
 * the banco. A cell renders only when its field is loaded, so a partial set
 * closes the gaps instead of leaving holes. The titular cell carries the CUIT,
 * since a payer reads the two together on the bank's confirmation screen.
 */
function IdentifierGrid({
  instructions,
}: {
  instructions: PaymentInstructions;
}) {
  const holderLine = formatPaymentHolderLine(instructions);

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {instructions.cbu ? (
        <CopyableCell label="CBU/CVU" value={instructions.cbu} />
      ) : null}
      {instructions.alias ? (
        <CopyableCell label="Alias" value={instructions.alias} />
      ) : null}
      {holderLine ? <Cell label="Titular">{holderLine}</Cell> : null}
      {instructions.bankName ? (
        <Cell label="Banco">{instructions.bankName}</Cell>
      ) : null}
    </dl>
  );
}

function Cell({
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
 * The value renders in one unbroken run, exactly as stored: a CBU is not a card
 * number, so there is no grouping in fours, and no `break-all` — 22 digits must
 * not wrap mid-number at the narrowest width.
 */
function CopyableCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {value}
        </span>
        <CopyIconButton label={label} value={value} />
      </dd>
    </div>
  );
}

/**
 * Inline feedback, never a toast: copying never reaches the server, and toasts
 * are reserved for server-confirmed results. The clipboard receives the stored
 * value exactly.
 */
function CopyIconButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </Button>
  );
}

/**
 * Paragraphs split on blank lines, single newlines preserved, and nothing else.
 * No markup language and no autolinking: a URL renders as the characters it is.
 */
function InstructionsText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/);

  return (
    <div className="flex flex-col gap-2 text-sm leading-6">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
