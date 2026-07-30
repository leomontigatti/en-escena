/**
 * THROWAWAY PROTOTYPE — ticket #550's price picker.
 *
 * The first bullet of #550: where the picker lives, what it shows, and what the
 * *second* allocation does to an inscription that already has a price.
 *
 * What it shows is settled here — **row name, amount and deadline**, because
 * #551 blessed deadline divergence as normal, so the deadline is the only thing
 * distinguishing two otherwise identical rows; and the price's group type when
 * it differs from the choreography's, which is #551's `groupTypeMismatch`
 * anomaly caught at the moment it would be created rather than reported after.
 *
 * And the second pick is settled: **the price is fixed by the first
 * allocation**, so once money has landed the picker is replaced by the price it
 * is locked to, plus the way out — take every allocation off and it clears
 * itself (#549).
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatAmount, formatDate } from "../formatters";
import { readPriceLock } from "./allocation-rules";
import type { InscriptionReading, PrototypeState } from "./fixtures";

export function PriceSelect({
  inscription,
  state,
  choreographyGroupType,
  onSelectPrice,
  size,
  id,
}: {
  inscription: InscriptionReading;
  state: PrototypeState;
  choreographyGroupType: string;
  onSelectPrice: (inscriptionId: string, priceId: string | null) => void;
  size?: "sm";
  id?: string;
}) {
  const lock = readPriceLock(inscription);

  // Locked: there is nothing to choose, so no disabled control is offered — just
  // the price it is fixed to and how to get out of it.
  if (lock.isLocked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {inscription.priceName ?? "Sin precio"}
        </span>
        <p className="text-xs text-muted-foreground">{lock.lockedReason}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={inscription.selectedPriceId ?? ""}
        onValueChange={(value) => onSelectPrice(inscription.id, value)}
      >
        <SelectTrigger
          id={id}
          size={size}
          className={size === "sm" ? "w-56" : "w-full"}
        >
          <SelectValue placeholder="Elegí un precio" />
        </SelectTrigger>
        <SelectContent>
          {state.prices.map((price) => (
            <SelectItem key={price.id} value={price.id}>
              <span className="flex flex-col items-start">
                <span>
                  {price.name} · {formatAmount(price.amount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Vence {formatDate(price.paymentDeadline)}
                  {price.groupType === choreographyGroupType
                    ? ""
                    : ` · ${price.groupType}, no ${choreographyGroupType}`}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {inscription.selectedPriceId === null ? (
        <p className="text-xs text-muted-foreground">
          Sin precio no hay figura contra la que medir: elegir uno es parte de
          poner la primera plata.
        </p>
      ) : null}
    </div>
  );
}
