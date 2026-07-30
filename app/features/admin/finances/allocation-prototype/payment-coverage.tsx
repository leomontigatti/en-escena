/**
 * THROWAWAY PROTOTYPE — what each payment ended up covering.
 *
 * This started as the artifact for "does a preset draw from one payment or from
 * `Saldo disponible` at large?". That question is now **dissolved rather than
 * answered**: the admin never picks a payment, so the fill rule decides, and
 * this panel is a **derived audit view** rather than a record of anyone's
 * decisions. Nobody can be asked why payment #41 covered a given dancer — the
 * answer is always "oldest payment first".
 *
 * It survives because the reading is still wanted: months later somebody asks
 * what a transfer paid for, and the answer has to exist. It just is not an
 * input any more.
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
          Lectura derivada: el reparto entre pagos lo resuelve el sistema, del
          más viejo al más nuevo. Nadie elige el pago al asignar.
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
