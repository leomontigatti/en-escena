import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleAlert, CircleCheck, Info, Vote } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { cn } from "@/lib/shared/utils";

import { FinalistCarousel } from "./finalist-carousel";
import {
  voteFormSchema,
  type VoteActionData,
  type VoteBlockReason,
  type VoteFinalist,
  type VoteFormValues,
  type VotePageData,
} from "./shared";

/**
 * The public vote of the `Gran final`, designed for the phone a visitor
 * scanned their ticket's QR code with. It reads in four states: the vote has
 * not opened, the finalists to choose from, the vote already registered, and
 * the vote closed.
 */
export function VotePageView({ page }: { page: VotePageData }) {
  return (
    <PublicVoteShell>
      {page.state === "not-open" ? <NotOpen /> : null}
      {page.state === "closed" ? <Closed /> : null}
      {page.state === "open" ? (
        <OpenVote
          blockReasons={page.blockReasons}
          code={page.code}
          finalists={page.finalists}
        />
      ) : null}
      {page.state === "registered" ? (
        <Registered finalist={page.finalist} />
      ) : null}
    </PublicVoteShell>
  );
}

function PublicVoteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 max-w-2xl items-center gap-2 px-4 py-2">
          <EnEscenaAvatar />
          <div className="grid text-sm leading-tight">
            <span className="font-medium">En Escena</span>
            <span className="text-xs text-muted-foreground">
              Votación del público
            </span>
          </div>
        </div>
      </header>
      <main
        id="contenido-principal"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col"
      >
        {children}
      </main>
    </div>
  );
}

// No count, before or after: there is no public live tally.
function NotOpen() {
  return (
    <div className="p-4">
      <PortalEmptyState
        title="La votación todavía no está abierta"
        description="La votación de la Gran final todavía no empezó. Cuando se abra, vas a poder votar desde esta página con el código QR de tu entrada."
      />
    </div>
  );
}

function Closed() {
  return (
    <div className="p-4">
      <PortalEmptyState
        title="La votación está cerrada"
        description="La votación de la Gran final terminó y ya no se aceptan votos. El resultado se anuncia al cierre de la gala."
      />
    </div>
  );
}

/**
 * The finalists, each with its pictures and a button that chooses it; the
 * choice is confirmed from a bar fixed at the bottom. Without a code that can
 * vote, everything stays the same and the confirmation says why it cannot.
 */
function OpenVote({
  blockReasons,
  code,
  finalists,
}: {
  blockReasons: VoteBlockReason[];
  code: string | null;
  finalists: VoteFinalist[];
}) {
  const fetcher = useFetcher<VoteActionData>();
  const isVoting = fetcher.state !== "idle";
  const [isBlockedOpen, setIsBlockedOpen] = useState(false);
  const form = useForm<VoteFormValues>({
    defaultValues: { academyId: "", codigo: code ?? "" },
    resolver: zodResolver(voteFormSchema),
  });
  const selectedId = form.watch("academyId");
  const selected = finalists.find(
    (finalist) => finalist.academyId === selectedId,
  );

  useServerActionToast(fetcher.data);

  return (
    <form
      method="post"
      onSubmit={createValidatedReactRouterSubmitHandler(form, fetcher.submit, {
        method: "post",
      })}
      className="flex flex-col"
    >
      <div className="flex flex-col gap-1 px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold">Gran final</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Elegí la academia que más te gustó. Podés votar una sola vez.
        </p>
      </div>

      {blockReasons.length > 0 ? (
        <div className="px-4">
          <AlertStack>
            {blockReasons.map((reason) => (
              <BlockReasonAlert key={reason.code} reason={reason} />
            ))}
          </AlertStack>
        </div>
      ) : null}

      <ul className={cn("flex flex-col gap-4 p-4", selected && "pb-28")}>
        {finalists.map((finalist) => {
          const isSelected = finalist.academyId === selectedId;

          return (
            <li key={finalist.academyId}>
              <Card className={cn("pt-0", isSelected && "ring-2 ring-primary")}>
                <FinalistCarousel finalist={finalist}>
                  <FinalistCaption finalist={finalist} />
                  {isSelected ? (
                    <span className="pointer-events-none absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="size-5" />
                    </span>
                  ) : null}
                </FinalistCarousel>
                <CardContent>
                  <Button
                    aria-pressed={isSelected}
                    className="w-full"
                    disabled={isVoting}
                    onClick={() =>
                      form.setValue(
                        "academyId",
                        isSelected ? "" : finalist.academyId,
                      )
                    }
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                  >
                    {isSelected ? (
                      <>
                        <Check aria-hidden="true" data-icon="inline-start" />
                        Elegida
                      </>
                    ) : (
                      "Elegir esta academia"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <div className="grid min-w-0 flex-1 text-sm leading-tight">
              <span className="text-xs text-muted-foreground">Tu voto</span>
              <span className="truncate font-medium" title={selected.name}>
                {selected.name}
              </span>
            </div>
            {blockReasons.length > 0 ? (
              <Button onClick={() => setIsBlockedOpen(true)} type="button">
                <Vote aria-hidden="true" data-icon="inline-start" />
                Confirmar voto
              </Button>
            ) : (
              <Button disabled={isVoting} type="submit">
                {isVoting ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Vote aria-hidden="true" data-icon="inline-start" />
                )}
                Confirmar voto
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <BlockedActionDialog
        description="Hace falta un código QR vigente de esta votación, que vota una sola vez."
        onOpenChange={setIsBlockedOpen}
        open={isBlockedOpen}
        reasons={blockReasons.map((reason) => reason.label).join(" ")}
        reasonsTitle="Motivo"
        title="No se puede votar"
      />
    </form>
  );
}

const blockReasonTitles: Record<VoteBlockReason["code"], string> = {
  "no-code": "Votá con tu código QR",
  "unknown-code": "Código QR no válido",
  "voided-code": "Código QR anulado",
};

function BlockReasonAlert({ reason }: { reason: VoteBlockReason }) {
  const isError = reason.code !== "no-code";

  return (
    <Alert variant={isError ? "destructive" : "info"}>
      {isError ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <Info aria-hidden="true" />
      )}
      <AlertTitle>{blockReasonTitles[reason.code]}</AlertTitle>
      <AlertDescription>{reason.label}</AlertDescription>
    </Alert>
  );
}

function FinalistCaption({ finalist }: { finalist: VoteFinalist }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-black/75 to-transparent px-4 pt-10 pb-3 text-white">
      <span className="text-lg leading-tight font-semibold text-balance">
        {finalist.name}
      </span>
      {finalist.city ? (
        <span className="text-sm opacity-90">{finalist.city}</span>
      ) : null}
    </div>
  );
}

function Registered({ finalist }: { finalist: VoteFinalist }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <CircleCheck aria-hidden="true" className="size-12 text-brand" />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Tu voto fue registrado</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Gracias por votar en la Gran final. El resultado se anuncia al cierre
          de la gala.
        </p>
      </div>
      <Card size="sm" className="w-full max-w-sm pt-0">
        <FinalistCarousel finalist={finalist} />
        <CardHeader className="text-left">
          <CardDescription>Votaste a</CardDescription>
          <CardTitle>{finalist.name}</CardTitle>
          {finalist.city ? (
            <CardDescription>{finalist.city}</CardDescription>
          ) : null}
        </CardHeader>
      </Card>
      <p className="text-xs text-muted-foreground">
        Ya podés cerrar esta página.
      </p>
    </div>
  );
}
