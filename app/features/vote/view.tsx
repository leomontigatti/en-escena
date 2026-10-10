import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Crown,
  ExternalLink,
  Vote,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
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
import { GoogleIcon } from "./google-icon";
import type { InAppBrowser } from "./in-app-browser";
import { PublicVoteShell } from "./public-shell";
import {
  voteFormSchema,
  type VoteActionData,
  type VoteCodeRefusal,
  type VoteFinalist,
  type VoteFormValues,
  type VotePageData,
  type PublishedFinalist,
} from "./shared";

/**
 * The public vote of the `Gran final`, designed for the phone a visitor
 * scanned their ticket's QR code with, or signed in with Google on. It reads
 * in seven states: the vote has not opened, the sign-in it asks for first, a
 * code that cannot vote, the finalists to choose from, the vote already
 * registered, the vote closed, and the published result.
 */
export function VotePageView({ page }: { page: VotePageData }) {
  return (
    <PublicVoteShell subtitle="Votación del público">
      {page.state === "not-open" ? <NotOpen /> : null}
      {page.state === "closed" ? <Closed /> : null}
      {page.state === "published" ? (
        <Published
          ranking={page.ranking}
          roundNumber={page.roundNumber}
          tieBrokenByCodeVotes={page.tieBrokenByCodeVotes}
        />
      ) : null}
      {page.state === "sign-in" ? (
        <SignIn google={page.google} inAppBrowser={page.inAppBrowser} />
      ) : null}
      {page.state === "code-refused" ? (
        <CodeRefused reason={page.reason} />
      ) : null}
      {page.state === "open" ? (
        // Keyed by round: the form's values start over when the
        // `Desempate` opens on a page already showing round 1.
        <OpenVote
          code={page.code}
          finalists={page.finalists}
          key={page.roundId}
          roundId={page.roundId}
        />
      ) : null}
      {page.state === "registered" ? (
        <Registered finalist={page.finalist} />
      ) : null}
    </PublicVoteShell>
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
 * A visitor with nothing that votes: no code in the address and no sign-in.
 * The finalists wait for the sign-in with Google; where the deployment has
 * none, only the ticket's QR code votes. Inside an app's built-in browser,
 * where Google refuses the sign-in, the page sends the visitor to the phone's
 * own browser first.
 */
function SignIn({
  google,
  inAppBrowser,
}: {
  google: boolean;
  inAppBrowser: InAppBrowser | null;
}) {
  if (google && inAppBrowser) {
    return <LeaveInAppBrowser inAppBrowser={inAppBrowser} />;
  }

  return (
    <SignInLayout
      description={
        google
          ? "Para votar, primero ingresá con tu cuenta de Google. Cada cuenta vota una sola vez."
          : "Para votar hace falta el código QR que viene con tu entrada. Escanealo con la cámara del celular."
      }
    >
      {google ? <GoogleSignInForm /> : null}
    </SignInLayout>
  );
}

/**
 * Android opens the intent in the phone's browser; an iPhone has no such
 * address, so the app's own menu is the way out, and on Android it is the
 * fallback when the app ignores the link.
 */
function LeaveInAppBrowser({ inAppBrowser }: { inAppBrowser: InAppBrowser }) {
  return (
    <SignInLayout
      description={`${inAppBrowser.app} no permite ingresar con Google desde su navegador. Para votar, abrí esta página en el navegador del celular.`}
    >
      {inAppBrowser.androidIntentUrl ? (
        <Button asChild className="w-full">
          <a href={inAppBrowser.androidIntentUrl}>
            <ExternalLink aria-hidden="true" data-icon="inline-start" />
            Abrir en el navegador
          </a>
        </Button>
      ) : null}
      <p className="text-sm leading-6 text-muted-foreground">
        {inAppBrowser.androidIntentUrl ? "Si no se abre, tocá" : "Tocá"} el menú
        ⋯ de arriba a la derecha y elegí la opción para abrir en el navegador.
      </p>
    </SignInLayout>
  );
}

function SignInLayout({
  children,
  description,
}: {
  children?: React.ReactNode;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <Vote aria-hidden="true" className="size-12 text-brand" />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Votá en la Gran final</h1>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children ? (
        <div className="flex w-full max-w-sm flex-col gap-3">{children}</div>
      ) : null}
    </div>
  );
}

const codeRefusalLabels: Record<VoteCodeRefusal, string> = {
  "unknown-code":
    "Este código QR no es de esta votación. Revisá que sea el que viene con tu entrada.",
  "voided-code":
    "Este código QR fue anulado por la organización y ya no sirve para votar.",
};

const codeRefusalTitles: Record<VoteCodeRefusal, string> = {
  "unknown-code": "Código QR no válido",
  "voided-code": "Código QR anulado",
};

/** A code that cannot vote: what happened to it, and no finalist. */
function CodeRefused({ reason }: { reason: VoteCodeRefusal }) {
  return (
    <div className="p-4">
      <PortalEmptyState
        description={codeRefusalLabels[reason]}
        icon={<CircleAlert aria-hidden="true" />}
        title={codeRefusalTitles[reason]}
      />
    </div>
  );
}

/**
 * The finalists, each with its pictures and a button that chooses it; the
 * choice is confirmed from a bar fixed at the bottom. Only a visitor who can
 * vote reaches it: a live code, or a signed-in voter.
 */
function OpenVote({
  code,
  finalists,
  roundId,
}: {
  code: string | null;
  finalists: VoteFinalist[];
  roundId: string;
}) {
  const fetcher = useFetcher<VoteActionData>();
  const isVoting = fetcher.state !== "idle";
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
      <div className="flex flex-col gap-1 px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold">Gran final</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Elegí la academia que más te gustó. Podés votar una sola vez.
        </p>
      </div>

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
          <ConfirmVoteBar isVoting={isVoting} selected={selected} />
        ) : null}
      </form>
    </div>
  );
}

/** The chosen finalist and the confirmation, in a bar fixed at the bottom. */
function ConfirmVoteBar({
  isVoting,
  selected,
}: {
  isVoting: boolean;
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
        <Button disabled={isVoting} type="submit">
          {isVoting ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Vote aria-hidden="true" data-icon="inline-start" />
          )}
          Confirmar voto
        </Button>
      </div>
    </div>
  );
}

/**
 * Starts the sign-in with Google: a plain form, so the browser follows the
 * redirect to Google as a page, and nothing prefetches it.
 */
function GoogleSignInForm() {
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
        ) : (
          <GoogleIcon aria-hidden="true" data-icon="inline-start" />
        )}
        Ingresar con Google
      </Button>
    </form>
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
