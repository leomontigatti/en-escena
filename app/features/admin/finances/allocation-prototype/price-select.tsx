/**
 * THROWAWAY PROTOTYPE — ticket #550's price picker, shared by every variant.
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
 * What the second pick does is *not* settled: it follows the prototype's
 * `RepickPolicy` switch so all three answers can be tried.
 */
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatAmount, formatDate } from "../formatters";
import { readRepick, type RepickPolicy } from "./allocation-rules";
import type { InscriptionReading, PrototypeState } from "./fixtures";

export function PriceSelect({
  inscription,
  state,
  choreographyGroupType,
  repickPolicy,
  onSelectPrice,
  size,
  id,
}: {
  inscription: InscriptionReading;
  state: PrototypeState;
  choreographyGroupType: string;
  repickPolicy: RepickPolicy;
  onSelectPrice: (inscriptionId: string, priceId: string | null) => void;
  size?: "sm";
  id?: string;
}) {
  const repick = readRepick(inscription, repickPolicy);

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={inscription.selectedPriceId ?? ""}
        disabled={!repick.canRepick}
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

      {repick.blockedReason !== null ? (
        <p className="text-xs text-muted-foreground">{repick.blockedReason}</p>
      ) : null}

      {repick.warning !== null ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{repick.warning}</AlertDescription>
        </Alert>
      ) : null}

      {repick.isFirstPick && inscription.selectedPriceId === null ? (
        <p className="text-xs text-muted-foreground">
          Sin precio no hay figura contra la que medir: elegir uno es parte de
          poner la primera plata.
        </p>
      ) : null}
    </div>
  );
}
