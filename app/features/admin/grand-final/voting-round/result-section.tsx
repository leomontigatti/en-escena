import { Info, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import {
  formatVoteShare,
  type RankedFinalist,
} from "@/lib/grand-final/ranking";

import type { VotingRoundResultView } from "./shared";

/**
 * The last closed round's result on administration's list: the ranking by
 * weighted points with each finalist's share, a round 1 tie for first place
 * called out with what settles it, and a `Desempate` still tied called out as
 * a shared win. Shown only once the round closed: nothing reveals totals
 * while one is open.
 */
export function VotingRoundResultSection({
  result,
}: {
  result: VotingRoundResultView;
}) {
  const columns: DataTableColumn<RankedFinalist>[] = [
    {
      id: "position",
      header: "Puesto",
      cell: (row) => `${row.position}.º`,
    },
    {
      id: "academy",
      header: "Academia",
      className: "font-medium",
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.name}
          {row.winner ? <Badge variant="success">Ganadora</Badge> : null}
        </div>
      ),
    },
    {
      id: "code-votes",
      header: "Votos con QR",
      cell: (row) => row.codeVotes,
    },
    {
      id: "voter-votes",
      header: "Votos con Google",
      cell: (row) => row.voterVotes,
    },
    { id: "points", header: "Puntos", cell: (row) => row.points },
    {
      id: "share",
      header: "Porcentaje",
      cell: (row) => formatVoteShare(row.percentage),
    },
  ];

  return (
    <section
      aria-labelledby="gran-final-resultado"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <h3 id="gran-final-resultado" className="text-base font-semibold">
          {result.roundNumber > 1
            ? "Resultado del desempate"
            : "Resultado de la votación"}
        </h3>
        {result.published ? (
          <Badge variant="success">Publicado</Badge>
        ) : (
          <Badge variant="secondary">Sin publicar</Badge>
        )}
      </div>
      <OutcomeAlert result={result} />
      <ClientDataTable<RankedFinalist>
        columns={columns}
        emptyMessage="La votación no tuvo academias finalistas."
        getRowKey={(row) => row.academyId}
        hidePagination
        hideSearch
        rows={result.entries}
        searchPlaceholder="Buscar academia"
      />
      <p className="text-sm text-muted-foreground">
        Cada voto con código QR suma 10 puntos y cada voto con Google, 1. El
        porcentaje es la parte de los puntos de la votación.
      </p>
    </section>
  );
}

function OutcomeAlert({ result }: { result: VotingRoundResultView }) {
  const tiedNames = result.entries
    .filter((entry) => result.outcome.academyIds.includes(entry.academyId))
    .map((entry) => entry.name);
  const names = new Intl.ListFormat("es", { type: "conjunction" }).format(
    tiedNames,
  );

  if (result.outcome.kind === "tie") {
    return (
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Empate en el primer puesto</AlertTitle>
        <AlertDescription>
          {names} empataron en puntos. El resultado no se puede publicar: abrí
          el desempate desde Acciones para que el público vote solo entre ellas.
        </AlertDescription>
      </Alert>
    );
  }

  if (result.outcome.kind === "shared") {
    const allWin = tiedNames.length === 2 ? "ganan las dos" : "ganan todas";

    return (
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertTitle>Empate también en el desempate</AlertTitle>
        <AlertDescription>
          {names} empataron en puntos y en votos con código QR, así que {allWin}
          .
        </AlertDescription>
      </Alert>
    );
  }

  if (result.tieBrokenByCodeVotes) {
    return (
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertTitle>Desempate definido por votos con código QR</AlertTitle>
        <AlertDescription>
          {names} ganó porque empató en puntos y tuvo más votos con código QR.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
