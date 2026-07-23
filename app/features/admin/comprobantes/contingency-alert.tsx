import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

// Estado de contingencia de ARCA superficializado para la UI: el `Resultado`
// crudo y los mensajes de error/observación ya formateados a texto. Se presenta
// cuando WSFEv1 no autoriza un comprobante, sin dejar nada persistido.
export type ArcaContingency = {
  resultado: string | null;
  errors: string[];
  observaciones: string[];
};

/**
 * Estado de contingencia de ARCA. Presenta el mensaje general y cada error u
 * observación crudos: la operación no se completó y no se persistió nada, así que
 * la operadora puede reintentar sin que la UI quede en un estado inconsistente.
 * Compartido por la emisión (#447) y la anulación (#474).
 */
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
          {contingency.errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
          {contingency.observaciones.map((observacion) => (
            <span key={observacion}>{observacion}</span>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
