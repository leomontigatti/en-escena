// Data and legends for the comprobante printout (#329/#334). The issuer is
// `Proyecciones Artísticas Asociación Civil`, a civil association EXEMPT from VAT
// (#426): it is NOT a monotributista. The legend for the issuer's VAT condition
// is "IVA Exento" — not "Responsable Monotributo" — and that is what differs
// from the monotributo case. The rest of the class C printout (letter "C",
// final-consumer recipient, no itemized VAT) is identical.

// The issuer's registered name. The CUIT is not fixed here: it is taken from
// each comprobante's immutable snapshot (`issuerCuit`), which is what was
// actually authorized.
export const ISSUER_LEGAL_NAME = "Proyecciones Artísticas Asociación Civil";

// The issuer's VAT condition. An exempt civil association prints "IVA Exento";
// this is the legend that differs from a monotributista's, which would print
// "Responsable Monotributo".
export const ISSUER_VAT_CONDITION_LABEL = "IVA Exento";

// The recipient's condition: anonymous final consumer (#324).
export const RECIPIENT_VAT_CONDITION_LABEL = "Consumidor Final";

// ARCA's authorization legend accompanying the CAE and the QR (RG 4291).
export const COMPROBANTE_AUTHORIZED_LABEL = "Comprobante Autorizado";
