import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ArcaUnreachableStage } from "@/lib/comprobantes/arca/unreachable";

/**
 * Contingencia de ARCA superficializada para la UI (#339, diferenciada en #474).
 * Son dos situaciones con riesgos distintos y no deben presentarse igual:
 *
 * - `rejected`: ARCA respondió y no autorizó. Con certeza no se generó ningún
 *   comprobante, así que se puede corregir y reintentar sin duplicar.
 * - `unreachable`: ARCA no respondió. Si el corte fue consultando el correlativo
 *   tampoco se generó nada; si fue durante la autorización, no se sabe, y
 *   reintentar a ciegas puede emitir un segundo comprobante.
 */
export type ArcaContingency =
  | {
      kind: "rejected";
      resultado: string | null;
      errors: string[];
      observaciones: string[];
    }
  | {
      kind: "unreachable";
      stage: ArcaUnreachableStage;
      detail: string;
    };

export function ContingencyAlert({
  contingency,
  message,
}: {
  contingency: ArcaContingency;
  message: string;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        <div className="flex flex-col gap-1">
          <span>{message}</span>
          {contingency.kind === "rejected" ? (
            <RejectionDetail contingency={contingency} />
          ) : (
            <UnreachableDetail contingency={contingency} />
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

// Un rechazo trae los mensajes crudos de ARCA, que son los que dicen qué
// corregir. No se persistió nada, y eso hay que decirlo en el JSX y no sólo en
// un comentario del server.
function RejectionDetail({
  contingency,
}: {
  contingency: Extract<ArcaContingency, { kind: "rejected" }>;
}) {
  return (
    <>
      {contingency.errors.map((error) => (
        <span key={error}>{error}</span>
      ))}
      {contingency.observaciones.map((observacion) => (
        <span key={observacion}>{observacion}</span>
      ))}
      <span className="font-medium">
        No se generó ningún comprobante. Podés corregir y reintentar sin riesgo
        de duplicar.
      </span>
    </>
  );
}

// Sin respuesta de ARCA no hay mensajes que mostrar: lo único accionable es qué
// hacer antes de reintentar, que depende de la fase en la que se cortó.
function UnreachableDetail({
  contingency,
}: {
  contingency: Extract<ArcaContingency, { kind: "unreachable" }>;
}) {
  return (
    <span className="font-medium">
      {contingency.stage === "lookup"
        ? "No se generó ningún comprobante."
        : "No reintentes sin verificar antes en ARCA: podría haberse autorizado un comprobante que el sistema no registró."}
    </span>
  );
}
