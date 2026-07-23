/**
 * Contingencia por falta de respuesta de ARCA (#474): la llamada SOAP falló por
 * red, timeout o caída del servicio, así que no hay `Resultado` que interpretar.
 * Es un caso distinto del rechazo —donde ARCA sí respondió y dijo que no— y el
 * riesgo depende de la fase en la que se cortó.
 */
export type ArcaUnreachableStage =
  // `FECompUltimoAutorizado`: sólo se consultó el correlativo. No se pidió
  // autorizar nada, así que con certeza no se emitió ningún comprobante.
  | "lookup"
  // `FECAESolicitar`: se pidió el CAE y no sabemos si ARCA llegó a otorgarlo.
  // Reintentar a ciegas puede emitir un segundo comprobante por el mismo monto.
  | "authorization";

export type ArcaUnreachable = {
  stage: ArcaUnreachableStage;
  detail: string;
};

const UNREACHABLE_MESSAGES: Record<ArcaUnreachableStage, string> = {
  lookup:
    "No pudimos comunicarnos con ARCA para consultar el último comprobante " +
    "autorizado. No se emitió nada: reintentá en unos minutos.",
  authorization:
    "Se cortó la comunicación con ARCA mientras se autorizaba el comprobante. " +
    "No podemos saber si llegó a autorizarse. Antes de reintentar, verificá en " +
    "ARCA el último comprobante autorizado del punto de venta para no emitir " +
    "dos veces.",
};

export function buildUnreachableMessage(unreachable: ArcaUnreachable): string {
  return UNREACHABLE_MESSAGES[unreachable.stage];
}

/**
 * Corre una llamada a ARCA clasificando su falla por fase en lugar de dejar que
 * la excepción del SOAP escale al error boundary genérico. Sólo captura fallas
 * de comunicación: un rechazo llega como respuesta normal y se interpreta aparte.
 */
export async function attemptArca<T>(
  stage: ArcaUnreachableStage,
  run: () => Promise<T>,
): Promise<
  { ok: true; value: T } | { ok: false; unreachable: ArcaUnreachable }
> {
  try {
    return { ok: true, value: await run() };
  } catch (thrown) {
    return {
      ok: false,
      unreachable: {
        stage,
        detail: thrown instanceof Error ? thrown.message : String(thrown),
      },
    };
  }
}
