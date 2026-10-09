import { useEffect, useState } from "react";
import { Form, useLocation, useNavigation, useRevalidator } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { AuditLinkRefusal } from "@/lib/grand-final/audit-link.server";
import type {
  AuditFinalistTotals,
  AuditTotals,
} from "@/lib/grand-final/audit-totals.server";
import { readAuditLinkToken } from "@/lib/grand-final/audit-url";
import { formatVoteShare } from "@/lib/grand-final/ranking";
import {
  isUnexpectedActionError,
  type UnexpectedActionError,
} from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import { PublicVoteShell } from "../vote/public-shell";
import type { AuditActionData, AuditPageData } from "./shared";

/**
 * A refusal of the link, or the router's own failure when the open broke
 * unexpectedly, which leaves the form to try again.
 */
type AuditPageActionData = AuditActionData | UnexpectedActionError | undefined;

/**
 * The page an `auditLink` opens, for the phone of an auditor in the
 * audience: first the step that opens the link in this browser, then the
 * open round's totals, which a reload brings up to date. A refused link says
 * why, and a round that is not open shows no figure.
 */
export function AuditPageView({
  actionData,
  page,
}: {
  actionData: AuditPageActionData;
  page: AuditPageData;
}) {
  return (
    <PublicVoteShell subtitle="Auditoría de la votación">
      <AuditPageContent actionData={actionData} page={page} />
    </PublicVoteShell>
  );
}

function AuditPageContent({
  actionData,
  page,
}: {
  actionData: AuditPageActionData;
  page: AuditPageData;
}) {
  const token = useAuditLinkToken();
  const failure = isUnexpectedActionError(actionData) ? actionData : undefined;

  if (actionData && "reason" in actionData) {
    return <Refused reason={actionData.reason} />;
  }

  // A link in the address wins over whatever this browser opened before:
  // its session may be revoked, or the auditor was handed a new link.
  if (token) {
    return <OpenLink failure={failure} token={token} />;
  }

  if (page.state === "refused") {
    return <Refused reason={page.reason} />;
  }

  if (page.state === "open-link") {
    return token === null ? <NoLink /> : <OpenLink failure={failure} />;
  }

  return <Totals totals={page.totals} />;
}

/**
 * The token the address's fragment carries: `undefined` until the page
 * hydrates, since the server never sees a fragment, and null when there is
 * none. Opening the link redirects to the bare page, which drops it.
 */
function useAuditLinkToken() {
  const { hash } = useLocation();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  return isHydrated ? readAuditLinkToken(hash) : undefined;
}

const refusals: Record<
  AuditLinkRefusal,
  { description: string; title: string }
> = {
  "already-bound": {
    description:
      "Cada acceso de auditoría se abre en un solo dispositivo, y este ya se abrió en otro. Pedile a la organización un acceso nuevo.",
    title: "Este acceso ya se abrió en otro dispositivo",
  },
  revoked: {
    description:
      "La organización revocó este acceso de auditoría. Si todavía lo necesitás, pedile uno nuevo.",
    title: "Este acceso fue revocado",
  },
  unknown: {
    description:
      "Revisá que el enlace sea el que te dio la organización, completo.",
    title: "Este acceso no existe",
  },
};

function Refused({ reason }: { reason: AuditLinkRefusal }) {
  return (
    <div className="p-4">
      <PortalEmptyState {...refusals[reason]} />
    </div>
  );
}

function NoLink() {
  return (
    <div className="p-4">
      <PortalEmptyState
        title="Abrí el enlace de auditoría"
        description="Para ver los totales de la votación hace falta el enlace o el código QR que te dio la organización."
      />
    </div>
  );
}

/**
 * The token is in the fragment, which only the browser reads, and is sent
 * once in the form's body. The link binds only when the auditor presses the
 * button, so a chat app that previews it opens nothing. Until the page
 * hydrates there is no token yet, and the button waits for it.
 */
function OpenLink({
  failure,
  token,
}: {
  failure: UnexpectedActionError | undefined;
  token?: string;
}) {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const isOpening = navigation.state !== "idle";

  useServerActionToast(failure);

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Acceso de auditoría</CardTitle>
          <CardDescription>
            Este acceso se abre en un solo dispositivo: el primero que lo abra
            es el único que va a poder ver los totales. Abrilo en el celular con
            el que vas a seguir la votación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The fragment stays in the address through the submission, so a
              failure leaves the link to try again; a success redirects to
              the bare page. Browsers never send a fragment, and there is no
              token before hydration, so the server's markup matches. */}
          <Form
            action={token ? `${pathname}#${token}` : pathname}
            method="post"
            className="flex flex-col"
          >
            <input type="hidden" name="token" value={token ?? ""} />
            <Button type="submit" disabled={!token || isOpening}>
              {isOpening ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              Abrir en este dispositivo
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function Totals({ totals }: { totals: AuditTotals }) {
  if (totals.status === "not-open") {
    return (
      <div className="p-4">
        <PortalEmptyState
          title="La votación todavía no está abierta"
          description="Cuando la organización abra la votación vas a ver los totales acá. Recargá la página para actualizarla."
        />
      </div>
    );
  }

  if (totals.status === "closed") {
    return (
      <div className="p-4">
        <PortalEmptyState
          title="La votación está cerrada"
          description="Los totales se ven solo mientras la votación está abierta. El resultado lo publica la organización."
        />
      </div>
    );
  }

  return <OpenTotals totals={totals} />;
}

function OpenTotals({
  totals,
}: {
  totals: Extract<AuditTotals, { status: "open" }>;
}) {
  const roundName = totals.roundNumber > 1 ? "Desempate" : "Votación";

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Totales de la Gran final</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {roundName} abierta. Los totales pueden tener unos segundos de demora:
          actualizá la página para verlos al día.
        </p>
      </div>
      <RefreshButton />
      <dl className="grid grid-cols-2 gap-3">
        <Figure
          detail={
            totals.codes.voided > 0
              ? `${totals.codes.voided} anulados`
              : undefined
          }
          label="Códigos QR usados"
          value={`${totals.codes.consumed} de ${totals.codes.issued}`}
        />
        <Figure
          label="Votantes con Google"
          value={String(totals.distinctVoters)}
        />
      </dl>
      <ol aria-label="Totales por academia" className="flex flex-col gap-3">
        {totals.finalists.map((finalist) => (
          <li key={finalist.academyId}>
            <FinalistTotals finalist={finalist} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RefreshButton() {
  const revalidator = useRevalidator();
  const isRefreshing = revalidator.state !== "idle";

  return (
    <Button
      disabled={isRefreshing}
      onClick={() => {
        void revalidator.revalidate();
      }}
      variant="outline"
    >
      {isRefreshing ? (
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : null}
      Actualizar totales
    </Button>
  );
}

function Figure({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        {detail ? (
          <dd className="text-xs text-muted-foreground">{detail}</dd>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FinalistTotals({ finalist }: { finalist: AuditFinalistTotals }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="leading-tight font-medium text-balance">
              {finalist.name}
            </span>
            {finalist.city ? (
              <span className="text-sm text-muted-foreground">
                {finalist.city}
              </span>
            ) : null}
          </div>
          <span className="font-semibold tabular-nums">
            {formatVoteShare(finalist.percentage)}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Con Google</dt>
            <dd className="font-medium tabular-nums">{finalist.voterVotes}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Con código QR</dt>
            <dd className="font-medium tabular-nums">{finalist.codeVotes}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Puntos</dt>
            <dd className="font-medium tabular-nums">{finalist.points}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
