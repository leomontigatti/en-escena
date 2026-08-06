/**
 * THROWAWAY PROTOTYPE — ticket #550's price picker.
 *
 * The first bullet of #550: where the picker lives, what it shows, and what the
 * *second* allocation does to an inscription that already has a price.
 *
 * What it shows is settled here — **row name, amount and deadline**, because
 * #551 blessed deadline divergence as normal, so the deadline is the only thing
 * distinguishing two otherwise identical rows.
 *
 * **The menu is the choreography's group type and nothing else.** It used to
 * offer every row, annotating the foreign ones — `Dúo, no Grupo` — as #551's
 * `groupTypeMismatch` caught at the moment it would be created. #586 deleted
 * that anomaly by making the model unable to produce it: a `groupType` change
 * refreshes the price on the roster write. Offering the option is offering to
 * create exactly the state that decision forbids, so the rows are filtered
 * instead of labelled. The inscription's own row always stays in the menu — a
 * `Select` whose value is missing from its items renders empty.
 *
 * And the second pick is settled: **the price is fixed by the first
 * allocation**, so once money has landed the picker is replaced by the price it
 * is locked to, plus the way out — take every allocation off and it reverts to
 * the choreography's default, which is also when it unlocks (#549, amended).
 *
 * There is no empty state: `selectedPriceId` is never null, so the picker always
 * opens on a real price.
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
  onSelectPrice: (inscriptionId: string, priceId: string) => void;
  size?: "sm";
  id?: string;
}) {
  const lock = readPriceLock(inscription);
  const prices = state.prices.filter(
    (price) =>
      price.groupType === choreographyGroupType ||
      price.id === inscription.selectedPriceId,
  );

  // Locked: there is nothing to choose, so no disabled control is offered — just
  // the price it is fixed to and how to get out of it.
  if (lock.isLocked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{inscription.priceName}</span>
        <p className="text-xs text-muted-foreground">{lock.lockedReason}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={inscription.selectedPriceId}
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
          {prices.map((price) => (
            <SelectItem key={price.id} value={price.id}>
              <span className="flex flex-col items-start">
                <span>
                  {price.name} · {formatAmount(price.amount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Vence {formatDate(price.paymentDeadline)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
