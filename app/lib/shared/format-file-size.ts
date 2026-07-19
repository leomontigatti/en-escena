const units = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Formatea una cantidad de bytes como string legible con unidades binarias
 * (cada escalón = 1024 del anterior): `B`, `KB`, `MB`, `GB`, `TB`.
 *
 * El valor se muestra con hasta un decimal (half-up), descartando el `.0`
 * sobrante (`1024` → `"1 KB"`, no `"1.0 KB"`).
 *
 * Pensado para tamaños entre 0 y el rango de TB; no maneja negativos ni
 * valores por encima de TB (se saturan en la unidad `TB`).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** exponent;
  const rounded = Math.round(value * 10) / 10;

  return `${rounded} ${units[exponent]}`;
}
