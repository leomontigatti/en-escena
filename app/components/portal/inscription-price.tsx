import { formatAmount } from "@/lib/finances/formatters";
import { splitInscriptionPrice } from "@/lib/finances/inscription-financial-status";

/**
 * What one inscription costs, said before it is registered: the price, and
 * under it the two components the reglamento splits it into (#674). The split
 * has to be disclosed before contracting, so every portal surface that quotes a
 * price at registration renders it through here.
 */
export function PortalInscriptionPrice({
  priceAmount,
  requiredDepositPercentage,
}: {
  priceAmount: number;
  requiredDepositPercentage: number;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4">
        <dt className="text-muted-foreground">Precio</dt>
        <dd className="text-right font-medium tabular-nums">
          {formatAmount(priceAmount)}
        </dd>
      </dl>
      <PortalInscriptionPriceSplit
        priceAmount={priceAmount}
        requiredDepositPercentage={requiredDepositPercentage}
      />
    </div>
  );
}

/** The split alone, for a surface that already says the price its own way. */
export function PortalInscriptionPriceSplit(input: {
  priceAmount: number;
  requiredDepositPercentage: number;
}) {
  const { participationFeeAmount, registrationFeeAmount } =
    splitInscriptionPrice(input);

  return (
    <p className="text-muted-foreground tabular-nums">
      Derecho de inscripción {formatAmount(registrationFeeAmount)} · Derecho de
      participación {formatAmount(participationFeeAmount)}
    </p>
  );
}
