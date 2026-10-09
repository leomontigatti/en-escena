import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Crown,
  Info,
  Vote,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { formatVoteShare } from "@/lib/grand-final/ranking";
import { voterSignInPath } from "@/lib/grand-final/vote-url";
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
  type VoteGoogleSignIn,
  type VotePageData,
  type PublishedFinalist,
} from "./shared";

/**
 * The public vote of the `Gran final`, designed for the phone a visitor
 * scanned their ticket's QR code with, or signed in with Google on. It reads
 * in five states: the vote has not opened, the finalists to choose from, the
 * vote already registered, the vote closed, and the published result.
 */
export function VotePageView({ page }: { page: VotePageData }) {
  return (
    <PublicVoteShell>
      {page.state === "not-open" ? <NotOpen /> : null}
      {page.state === "closed" ? <Closed /> : null}
      {page.state === "published" ? (
        <Published
          ranking={page.ranking}
          roundNumber={page.roundNumber}
          tieBrokenByCodeVotes={page.tieBrokenByCodeVotes}
        />
      ) : null}
      {page.state === "open" ? (
        // Keyed by round: the form's values start over when the
        // `Desempate` opens on a page already showing round 1.
        <OpenVote
          blockReasons={page.blockReasons}
          code={page.code}
          finalists={page.finalists}
          googleSignIn={page.googleSignIn}
          key={page.roundId}
          roundId={page.roundId}
        />
      ) : null}
      {page.state === "registered" ? (
        <Registered
          canAlsoSignIn={page.canAlsoSignIn}
          finalist={page.finalist}
        />
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
        description="La votación de la Gran final todavía no empezó. Cuando se abra, vas a poder votar desde esta página."
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
 * choice is confirmed from a bar fixed at the bottom. Without a code or a
 * sign-in that can vote, everything stays the same, Google is offered beside
 * the reason, and the confirmation says why it cannot.
 */
function OpenVote({
  blockReasons,
  code,
  finalists,
  googleSignIn,
  roundId,
}: {
  blockReasons: VoteBlockReason[];
  code: string | null;
  finalists: VoteFinalist[];
  googleSignIn: VoteGoogleSignIn;
  roundId: string;
}) {
  const fetcher = useFetcher<VoteActionData>();
  const isVoting = fetcher.state !== "idle";
  const [isBlockedOpen, setIsBlockedOpen] = useState(false);
  const form = useForm<VoteFormValues>({
    defaultValues: { academyId: "", codigo: code ?? "", roundId },
    resolver: zodResolver(voteFormSchema),
  });
  const selectedId = form.watch("academyId");
  const selected = finalists.find(
    (finalist) => finalist.academyId === selectedId,
  );

  useServerActionToast(fetcher.data);

  return (
    <div className="flex flex-col">
      <OpenVoteIntro blockReasons={blockReasons} googleSignIn={googleSignIn} />

      <form
        method="post"
        onSubmit={createValidatedReactRouterSubmitHandler(
          form,
          fetcher.submit,
          { method: "post" },
        )}
        className="flex flex-col"
      >
        <ul className={cn("flex flex-col gap-4 p-4", selected && "pb-28")}>
          {finalists.map((finalist) => {
            const isSelected = finalist.academyId === selectedId;

            return (
              <li key={finalist.academyId}>
                <Card
                  className={cn("pt-0", isSelected && "ring-2 ring-primary")}
                >
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
          <ConfirmVoteBar
            isBlocked={blockReasons.length > 0}
            isVoting={isVoting}
            onBlocked={() => setIsBlockedOpen(true)}
            selected={selected}
          />
        ) : null}
      </form>

      <BlockedActionDialog
        description={
          googleSignIn === "offered"
            ? "Hace falta ingresar con Google o un código QR vigente de esta votación. Cada uno vota una sola vez."
            : "Hace falta un código QR vigente de esta votación, que vota una sola vez."
        }
        onOpenChange={setIsBlockedOpen}
        open={isBlockedOpen}
        reasons={blockReasons.map((reason) => reason.label).join(" ")}
        reasonsTitle="Motivo"
        title="No se puede votar"
      />
    </div>
  );
}

/** The page's heading, and what keeps this visitor from voting, if anything. */
function OpenVoteIntro({
  blockReasons,
  googleSignIn,
}: {
  blockReasons: VoteBlockReason[];
  googleSignIn: VoteGoogleSignIn;
}) {
  return (
    <>
      <div className="flex flex-col gap-1 px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold">Gran final</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Elegí la academia que más te gustó. Podés votar una sola vez.
        </p>
        {googleSignIn === "signed-in" ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Ingresaste con tu cuenta de Google.
          </p>
        ) : null}
      </div>

      {blockReasons.length > 0 ? (
        <div className="flex flex-col gap-3 px-4">
          <AlertStack>
            {blockReasons.map((reason) => (
              <BlockReasonAlert
                googleOffered={googleSignIn === "offered"}
                key={reason.code}
                reason={reason}
              />
            ))}
          </AlertStack>
          {googleSignIn === "offered" ? (
            <GoogleSignInForm label="Votar con Google" />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** The chosen finalist and the confirmation, in a bar fixed at the bottom. */
function ConfirmVoteBar({
  isBlocked,
  isVoting,
  onBlocked,
  selected,
}: {
  isBlocked: boolean;
  isVoting: boolean;
  onBlocked: () => void;
  selected: VoteFinalist;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <div className="grid min-w-0 flex-1 text-sm leading-tight">
          <span className="text-xs text-muted-foreground">Tu voto</span>
          <span className="truncate font-medium" title={selected.name}>
            {selected.name}
          </span>
        </div>
        {isBlocked ? (
          <Button onClick={onBlocked} type="button">
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
  );
}

/**
 * Starts the sign-in with Google: a plain form, so the browser follows the
 * redirect to Google as a page, and nothing prefetches it.
 */
function GoogleSignInForm({ label }: { label: string }) {
  const [isStarting, setIsStarting] = useState(false);

  // Back from Google with the browser's back button, the page may come from
  // its cache with the button still pending.
  useEffect(() => {
    const reset = () => setIsStarting(false);
    window.addEventListener("pageshow", reset);

    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      action={voterSignInPath}
      method="post"
      onSubmit={() => setIsStarting(true)}
    >
      <Button
        className="w-full"
        disabled={isStarting}
        type="submit"
        variant="outline"
      >
        {isStarting ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : null}
        {label}
      </Button>
    </form>
  );
}

const blockReasonTitles: Record<
  Exclude<VoteBlockReason["code"], "no-identity">,
  string
> = {
  "unknown-code": "Código QR no válido",
  "voided-code": "Código QR anulado",
};

function readBlockReasonTitle(
  code: VoteBlockReason["code"],
  googleOffered: boolean,
) {
  if (code !== "no-identity") {
    return blockReasonTitles[code];
  }

  return googleOffered
    ? "Votá con Google o con tu código QR"
    : "Votá con tu código QR";
}

function BlockReasonAlert({
  googleOffered,
  reason,
}: {
  googleOffered: boolean;
  reason: VoteBlockReason;
}) {
  const isError = reason.code !== "no-identity";
  const title = readBlockReasonTitle(reason.code, googleOffered);

  return (
    <Alert variant={isError ? "destructive" : "info"}>
      {isError ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <Info aria-hidden="true" />
      )}
      <AlertTitle>{title}</AlertTitle>
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

function Registered({
  canAlsoSignIn,
  finalist,
}: {
  canAlsoSignIn: boolean;
  finalist: VoteFinalist;
}) {
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
      {canAlsoSignIn ? (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <p className="text-sm leading-6 text-muted-foreground">
            ¿Tenés cuenta de Google? También podés votar con ella.
          </p>
          <GoogleSignInForm label="Votar también con Google" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ya podés cerrar esta página.
        </p>
      )}
    </div>
  );
}

/**
 * The published `grandFinalResult`: every finalist of the last round in its
 * place, with its share of the weighted points. Tied finalists share a place,
 * and when a `Desempate` stayed tied every winner is marked.
 */
function Published({
  ranking,
  roundNumber,
  tieBrokenByCodeVotes,
}: {
  ranking: PublishedFinalist[];
  roundNumber: number;
  tieBrokenByCodeVotes: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Resultado de la Gran final</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {roundNumber > 1
            ? "Resultado del desempate entre las academias que empataron en el primer puesto. "
            : null}
          El porcentaje es la parte de los puntos de la votación que obtuvo cada
          academia.
        </p>
        {tieBrokenByCodeVotes ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Las academias empataron en puntos: ganó la que tuvo más votos con
            código QR.
          </p>
        ) : null}
      </div>
      <ol className="flex flex-col gap-3" aria-label="Ranking de la Gran final">
        {ranking.map((finalist) => (
          <li key={finalist.academyId}>
            <Card
              size="sm"
              className={cn(finalist.winner && "ring-2 ring-brand")}
            >
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-tight font-semibold tabular-nums">
                    {finalist.position}.º
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="leading-tight font-medium text-balance">
                      {finalist.name}
                    </span>
                    {finalist.city ? (
                      <span className="text-sm text-muted-foreground">
                        {finalist.city}
                      </span>
                    ) : null}
                    {finalist.winner ? (
                      <Badge variant="success" className="mt-1">
                        <Crown aria-hidden="true" data-icon="inline-start" />
                        Ganadora
                      </Badge>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatVoteShare(finalist.percentage)}
                  </span>
                </div>
                <Progress
                  aria-label={`Porcentaje de ${finalist.name}`}
                  value={finalist.percentage}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
