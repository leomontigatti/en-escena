/**
 * THROWAWAY PROTOTYPE — the artifact for #550's remaining question.
 *
 * "Does a preset draw from one payment, or from `Saldo disponible` at large?"
 * The two look nearly identical in the preset dialog — one chooser more or less
 * — so the difference cannot be judged there. It shows up **here**, months
 * later, when someone asks what a transfer actually paid for.
 *
 * Drawing at large is fewer clicks and never refuses while the academy has money
 * anywhere; the cost is that one preset can slice a single inscription's target
 * across two or three payments, so every payment ends up holding a little of
 * everything. Drawing from one payment keeps each of these lists short and
 * whole, at the price of refusing more often.
 *
 * Run a preset with «Todo el saldo disponible» and then with a single payment,
 * and compare this panel before and after. Nothing else in the prototype makes
 * the difference visible.
 */
import { Card, CardContent } from "@/components/ui/card";

import { formatAmount } from "../formatters";
import type { InscriptionReading, PaymentReading } from "./fixtures";

export function PaymentCoverage({
  payments,
  inscriptions,
}: {
  payments: PaymentReading[];
  inscriptions: InscriptionReading[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Qué cubrió cada pago</h2>
        <p className="text-xs text-muted-foreground">
          La pregunta abierta del ticket se ve acá, no en el diálogo del preset:
          cuánto se fragmenta la historia de un pago según de dónde saque la
          plata el preset.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {payments.map((payment) => {
          // Deterministic by dancer name, like the preset engine itself: this
          // panel must not reorder because of the order money was placed.
          const covered = inscriptions
            .flatMap((inscription) =>
              inscription.allocations
                .filter((allocation) => allocation.paymentId === payment.id)
                .map((allocation) => ({
                  inscription,
                  amount: allocation.amount,
                })),
            )
            .sort((left, right) =>
              left.inscription.dancerName.localeCompare(
                right.inscription.dancerName,
                "es-AR",
              ),
            );

          return (
            <Card key={payment.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    Pago #{payment.number}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatAmount(payment.availableAmount)} sin asignar
                  </span>
                </div>

                {covered.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No cubre nada de esta academia todavía.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {covered.map(({ inscription, amount }) => (
                      <li
                        key={inscription.id}
                        className="flex items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="truncate">
                          {inscription.dancerName}
                          <span className="text-muted-foreground">
                            {" · "}
                            {inscription.choreographyName}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {formatAmount(amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-muted-foreground">
                  {covered.length} inscripciones
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
