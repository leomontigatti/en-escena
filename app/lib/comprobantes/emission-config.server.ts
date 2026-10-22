import { getArcaClient } from "./arca/client.server";
import type { ComprobanteEmissionDeps } from "./emit-comprobante.server";

/**
 * Resolves the production emission inputs from the environment: the shared ARCA
 * client (with its TA cache) plus the sales point and the recipient's VAT
 * condition. The tests inject a mocked client and do not come through here.
 */
export function getComprobanteEmissionDeps(
  env: NodeJS.ProcessEnv = process.env,
): ComprobanteEmissionDeps {
  return {
    client: getArcaClient(env),
    ...readComprobanteEmissionConfig(env),
  };
}

/**
 * The configured sales point, for the reads that only need to name a series —
 * the date floor a financial detail shows — and must not fail where ARCA is
 * not configured. `null` when it is not.
 */
export function readConfiguredPtoVta(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const value = Number(env.ARCA_PTOVTA);

  return Number.isInteger(value) && value > 0 ? value : null;
}

export function readComprobanteEmissionConfig(
  env: NodeJS.ProcessEnv = process.env,
): Pick<
  ComprobanteEmissionDeps,
  "ptoVta" | "issuerCuit" | "receptorIvaConditionId"
> {
  return {
    ptoVta: requirePositiveIntEnv(env, "ARCA_PTOVTA"),
    issuerCuit: requireEnv(env, "ARCA_CUIT"),
    receptorIvaConditionId: requirePositiveIntEnv(
      env,
      "ARCA_CONDICION_IVA_RECEPTOR_ID",
    ),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable ${name}.`);
  }
  return value;
}

function requirePositiveIntEnv(env: NodeJS.ProcessEnv, name: string): number {
  const raw = requireEnv(env, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}="${raw}" is not a positive integer.`);
  }
  return value;
}
