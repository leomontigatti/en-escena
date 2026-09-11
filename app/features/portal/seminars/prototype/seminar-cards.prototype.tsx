// PROTOTYPE — throwaway, lives only on branch `prototype/891-seminar-money-portal`.
//
// Part of the portal seminar-money prototype for wayfinder ticket #891 (map #884):
// the built seminar gallery (`features/portal/seminars/list/view.tsx`) with money
// on it. Three card variants, three registration-dialog variants, and the two
// removal confirmations #889 decided (delete when unfunded, withdraw otherwise).
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarClock,
  ImageOff,
  Info,
  Plus,
  UserRound,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useFetcher } from "react-router";

import { PortalListPage } from "@/components/portal/ui";
import { SubmitButton } from "@/components/shared/action-buttons";
import { ComboboxField } from "@/components/shared/combobox-field";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  formatPortalSeminarMoment,
  registerPortalSeminarInscriptionSchema,
  type RegisterPortalSeminarInscriptionFormValues,
} from "@/features/portal/seminars/list/shared";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import { formatAmount } from "@/lib/finances/formatters";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { seminarStartedMessage } from "@/lib/seminars/registration-refusals";
import { createValidatedRouteFormDataSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  depositFor,
  formatPriceDeadline,
  isSeminarFull,
  listActiveInscriptions,
  listRegistrablePeople,
  type PortalMoneySeminar,
  type RegistrablePerson,
  type SeminarInscriptionFigures,
  type SeminarPriceRow,
} from "./seminar-money-portal-fixtures.prototype";

export type CardVariantId = "A" | "B" | "C";
export type DialogVariantId = "A" | "B" | "C";

type PrototypeActionData =
  | { intent: string; message: string; status: "error" | "success" }
  | undefined;

export function PortalSeminarsMoneyPrototype({
  cardVariant,
  dialogVariant,
  initialOpenSeminarId,
  seminarDetailHref,
  seminars,
}: {
  cardVariant: CardVariantId;
  dialogVariant: DialogVariantId;
  initialOpenSeminarId: string | null;
  seminarDetailHref: string;
  seminars: PortalMoneySeminar[];
}) {
  const fetcher = useFetcher<PrototypeActionData>();
  const [openSeminarId, setOpenSeminarId] = useState(initialOpenSeminarId);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const openSeminar =
    seminars.find((seminar) => seminar.id === openSeminarId) ?? null;
  const removing = findActiveInscription(seminars, removingId);
  const SeminarCard =
    cardVariant === "B"
      ? SeminarCardB
      : cardVariant === "C"
        ? SeminarCardC
        : SeminarCardA;

  useServerActionToast(fetcher.data);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.status === "success") {
      setOpenSeminarId(null);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <>
      <PortalListPage
        titleId="seminarios-title"
        title="Seminarios"
        // The built sentence says places go by registration order, which #888
        // made false: the place is taken when the deposit is covered.
        description="Inscribí a los bailarines y profesores de tu academia en los seminarios del evento activo. Cada inscripción toma su lugar cuando administración registra su seña."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {seminars.map((seminar) => (
            <SeminarCard
              key={seminar.id}
              seminar={seminar}
              seminarDetailHref={seminarDetailHref}
              onOpenRegister={() => setOpenSeminarId(seminar.id)}
              onRemoveInscription={setRemovingId}
            />
          ))}
        </div>
      </PortalListPage>

      {openSeminar ? (
        <RegisterDialogPrototype
          key={openSeminar.id}
          isSubmitting={fetcher.state !== "idle"}
          onClose={() => setOpenSeminarId(null)}
          seminar={openSeminar}
          submit={fetcher.submit}
          variant={dialogVariant}
        />
      ) : null}

      {removing && removing.inscription.allocatedAmount === 0 ? (
        <DeleteDialog
          title={removing.inscription.person.fullName}
          description={`Esta acción da de baja la inscripción en el seminario de ${removing.seminar.instructorName}. No se puede deshacer.`}
          intentValue="delete-seminar-inscription"
          recordId={removing.inscription.id}
          open
          onOpenChange={(nextOpen) => (nextOpen ? null : setRemovingId(null))}
        />
      ) : null}
      {removing && removing.inscription.allocatedAmount > 0 ? (
        <WithdrawDialog
          inscription={removing.inscription}
          instructorName={removing.seminar.instructorName}
          onOpenChange={(nextOpen) => (nextOpen ? null : setRemovingId(null))}
        />
      ) : null}
    </>
  );
}

function findActiveInscription(
  seminars: PortalMoneySeminar[],
  inscriptionId: string | null,
) {
  for (const seminar of seminars) {
    const inscription = listActiveInscriptions(seminar).find(
      (candidate) => candidate.id === inscriptionId,
    );

    if (inscription) {
      return { inscription, seminar };
    }
  }

  return null;
}

type SeminarCardProps = {
  seminar: PortalMoneySeminar;
  seminarDetailHref: string;
  onOpenRegister: () => void;
  onRemoveInscription: (inscriptionId: string) => void;
};

function SeminarBanner() {
  return (
    <div className="flex h-56 items-center justify-center overflow-hidden border-b bg-muted text-muted-foreground">
      <ImageOff aria-hidden="true" className="size-8" />
    </div>
  );
}

function SeminarHeading({
  action,
  seminar,
}: {
  action?: ReactNode;
  seminar: PortalMoneySeminar;
}) {
  return (
    <CardHeader>
      <CardTitle>{seminar.instructorName}</CardTitle>
      <CardDescription className="flex items-center gap-1.5">
        <CalendarClock aria-hidden="true" className="size-3.5" />
        {formatPortalSeminarMoment(seminar)}
      </CardDescription>
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
  );
}

/** "Started" is the footer's only closed reason now: registration is unlimited (#888). */
function RegisterOrStarted({
  onOpenRegister,
  seminar,
}: {
  onOpenRegister: () => void;
  seminar: PortalMoneySeminar;
}) {
  return seminar.hasStarted ? (
    <p className="flex h-8 items-center justify-center text-center text-xs text-muted-foreground">
      {seminarStartedMessage}
    </p>
  ) : (
    <Button type="button" onClick={onOpenRegister}>
      <Plus aria-hidden="true" data-icon />
      Inscribir
    </Button>
  );
}

function EmptyInscriptions() {
  return (
    <p className="text-sm text-muted-foreground">
      Todavía no inscribiste a nadie.
    </p>
  );
}

function RemoveButton({
  fullName,
  onRemove,
}: {
  fullName: string;
  onRemove: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`Quitar a ${fullName} del seminario`}
      className="-mr-1.5 size-4"
      onClick={onRemove}
    >
      <X aria-hidden="true" data-icon />
    </Button>
  );
}

function statusBadge(inscription: SeminarInscriptionFigures) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: [],
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );
}

function priceCells(seminar: PortalMoneySeminar) {
  return [
    { label: "Participantes", price: seminar.currentPrices.participants },
    { label: "No participantes", price: seminar.currentPrices.nonParticipants },
  ];
}

/**
 * A — the two prices as figures at the top of the card, each with its deposit
 * and its own deadline; chips colored by status with the status in words; the
 * participant reading as the person icon; the full notice as an `info` alert.
 */
function SeminarCardA({
  seminar,
  onOpenRegister,
  onRemoveInscription,
}: SeminarCardProps) {
  const active = listActiveInscriptions(seminar);

  return (
    <Card className="overflow-hidden">
      <SeminarBanner />
      <SeminarHeading seminar={seminar} />

      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          {priceCells(seminar).map((cell) => (
            <PriceFigure
              key={cell.label}
              label={cell.label}
              price={cell.price}
              rate={seminar.requiredDepositPercentage}
            />
          ))}
        </dl>

        {isSeminarFull(seminar) && !seminar.hasStarted ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              Cupo completo: podés inscribir igual, pero la seña de una nueva
              inscripción no se cubre hasta que se libere un lugar.
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        {active.length === 0 ? (
          <EmptyInscriptions />
        ) : (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-wrap gap-2">
              {active.map((inscription) => {
                const badge = statusBadge(inscription);
                const PersonIcon = inscription.readAsParticipant
                  ? UserRoundCheck
                  : UserRound;

                return (
                  <li key={inscription.id}>
                    <Badge
                      variant={badge.variant}
                      className="h-7 gap-1.5 pr-2.5"
                    >
                      <PersonIcon aria-hidden="true" />
                      {inscription.readAsParticipant ? (
                        <span className="sr-only">Participante:</span>
                      ) : null}
                      {inscription.person.fullName} · {badge.label}
                      {seminar.hasStarted ? null : (
                        <RemoveButton
                          fullName={inscription.person.fullName}
                          onRemove={() => onRemoveInscription(inscription.id)}
                        />
                      )}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {active.some((row) => row.readAsParticipant) ? (
              <p
                aria-hidden="true"
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <UserRoundCheck className="size-3.5" />
                Participante del evento
              </p>
            ) : null}
          </div>
        )}
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        <RegisterOrStarted onOpenRegister={onOpenRegister} seminar={seminar} />
      </CardFooter>
    </Card>
  );
}

function PriceFigure({
  label,
  price,
  rate,
}: {
  label: string;
  price: SeminarPriceRow | null;
  rate: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium tabular-nums">
        {price ? formatAmount(price.amount) : "Sin precio"}
      </dd>
      {price ? (
        <>
          <dd className="text-xs text-muted-foreground tabular-nums">
            Seña {formatAmount(depositFor(price.amount, rate))}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {formatPriceDeadline(price.paymentDeadline)}
          </dd>
        </>
      ) : null}
    </div>
  );
}

/**
 * B — prices as a two-line price list with the deposit as a percentage; the
 * inscriptions as rows instead of chips, each saying participant or not and
 * what it owes next, with the status badge; the full notice above the button.
 */
function SeminarCardB({
  seminar,
  onOpenRegister,
  onRemoveInscription,
}: SeminarCardProps) {
  const active = listActiveInscriptions(seminar);

  return (
    <Card className="overflow-hidden">
      <SeminarBanner />
      <SeminarHeading seminar={seminar} />

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <dl className="flex flex-col gap-2">
            {priceCells(seminar).map((cell) => (
              <div
                key={cell.label}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="flex flex-col">
                  <span>{cell.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {cell.price
                      ? formatPriceDeadline(cell.price.paymentDeadline)
                      : "Sin precio"}
                  </span>
                </dt>
                <dd className="font-medium tabular-nums">
                  {cell.price ? formatAmount(cell.price.amount) : "—"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            La seña es el {seminar.requiredDepositPercentage}% del precio.
          </p>
        </div>

        <Separator />

        {active.length === 0 ? (
          <EmptyInscriptions />
        ) : (
          <ul className="flex flex-col divide-y">
            {active.map((inscription) => {
              const badge = statusBadge(inscription);

              return (
                <li
                  key={inscription.id}
                  className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {inscription.person.fullName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {inscription.readAsParticipant
                        ? "Participante"
                        : "No participante"}{" "}
                      · {describeWhatIsOwed(inscription)}
                    </span>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {seminar.hasStarted ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Quitar a ${inscription.person.fullName} del seminario`}
                      onClick={() => onRemoveInscription(inscription.id)}
                    >
                      <X aria-hidden="true" data-icon />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        {isSeminarFull(seminar) && !seminar.hasStarted ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Info aria-hidden="true" className="size-3.5" />
            Cupo completo: las nuevas señas esperan un lugar.
          </p>
        ) : null}
        <RegisterOrStarted onOpenRegister={onOpenRegister} seminar={seminar} />
      </CardFooter>
    </Card>
  );
}

function describeWhatIsOwed(inscription: SeminarInscriptionFigures) {
  if (inscription.financialStatus === "depositPending") {
    return `Seña adeudada ${formatAmount(inscription.owedDepositAmount ?? 0)}`;
  }

  if (inscription.financialStatus === "depositMet") {
    return `Saldo adeudado ${formatAmount(inscription.owedBalanceAmount ?? 0)}`;
  }

  return "Sin saldo adeudado";
}

/**
 * C, second round — the card is a poster. The chips, the status badges, the
 * prices and the deposit all left it: who is registered and what it costs live
 * on the seminar detail behind `Ver detalle`, so the gallery answers only
 * whether the academy can still register someone. The full quota stays as a
 * header badge, because it is the one fact that changes what the buttons do.
 */
function SeminarCardC({
  seminar,
  seminarDetailHref,
  onOpenRegister,
}: SeminarCardProps) {
  const isFull = isSeminarFull(seminar);

  return (
    <Card className="overflow-hidden">
      <SeminarBanner />
      <SeminarHeading
        seminar={seminar}
        action={
          isFull && !seminar.hasStarted ? (
            <Badge variant="warning">Cupo completo</Badge>
          ) : undefined
        }
      />

      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        {seminar.hasStarted ? (
          <p className="flex h-8 items-center justify-center text-center text-xs text-muted-foreground">
            {seminarStartedMessage}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link to={seminarDetailHref}>Ver detalle</Link>
          </Button>
          {seminar.hasStarted ? null : (
            <Button type="button" className="flex-1" onClick={onOpenRegister}>
              <Plus aria-hidden="true" data-icon />
              Inscribir
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * The withdrawal confirmation for a row with money on it (#889), shared with the
 * seminar detail. Not the shared
 * `DeleteDialog`: that one always says "Esta acción es irreversible.", and a
 * withdrawal is revived by registering the same person again.
 */
export function WithdrawDialog({
  inscription,
  instructorName,
  onOpenChange,
}: {
  inscription: SeminarInscriptionFigures;
  instructorName: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{inscription.person.fullName}</AlertDialogTitle>
          <AlertDialogDescription>
            La inscripción en el seminario de {instructorName} tiene{" "}
            {formatAmount(inscription.allocatedAmount)} asignados, así que se
            retira en lugar de borrarse
            {inscription.covered ? " y libera su lugar" : ""}. El dinero sigue
            asignado a la inscripción; si la volvés a inscribir, vuelve con él.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <form method="post">
            <input
              type="hidden"
              name="intent"
              value="withdraw-seminar-inscription"
            />
            <input type="hidden" name="id" value={inscription.id} />
            <Button type="submit" variant="destructive">
              Retirar inscripción
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const personKindLabels = { dancer: "Bailarín", professor: "Profesor" } as const;

function groupByRole(people: RegistrablePerson[]) {
  return (
    [
      ["dancer", "Bailarines"],
      ["professor", "Profesores"],
    ] as const
  )
    .map(([kind, label]) => ({
      label,
      options: people
        .filter((candidate) => candidate.person.kind === kind)
        .map((candidate) => ({
          label: candidate.person.fullName,
          value: candidate.person.id,
        })),
    }))
    .filter((group) => group.options.length > 0);
}

function groupByParticipation(
  people: RegistrablePerson[],
  seminar: PortalMoneySeminar,
) {
  return [true, false]
    .map((forParticipants) => {
      const price = forParticipants
        ? seminar.currentPrices.participants
        : seminar.currentPrices.nonParticipants;

      return {
        label: `${forParticipants ? "Participantes" : "No participantes"}${
          price ? ` · ${formatAmount(price.amount)}` : ""
        }`,
        options: people
          .filter(
            (candidate) =>
              (candidate.price?.forParticipants ??
                candidate.person.participating) === forParticipants,
          )
          .map((candidate) => ({
            label: `${candidate.person.fullName} · ${personKindLabels[candidate.person.kind]}`,
            value: candidate.person.id,
          })),
      };
    })
    .filter((group) => group.options.length > 0);
}

function describeWhatTheyPay(candidate: RegistrablePerson) {
  if (!candidate.price || candidate.depositAmount === null) {
    return "Todavía no hay un precio para esta persona.";
  }

  const reading = candidate.price.forParticipants
    ? "como participante"
    : "como no participante";
  const deadline =
    candidate.price.paymentDeadline === null
      ? ""
      : `, ${formatPriceDeadline(candidate.price.paymentDeadline).toLowerCase()}`;
  const sentence = `Paga ${formatAmount(candidate.price.amount)} ${reading}, con una seña de ${formatAmount(candidate.depositAmount)}${deadline}.`;

  return candidate.revivedAllocatedAmount > 0
    ? `${sentence} Vuelve con ${formatAmount(candidate.revivedAllocatedAmount)} ya asignados de su inscripción anterior.`
    : sentence;
}

/**
 * A — as built, plus what the picked person would pay under the picker.
 * B — grouped by participant cell with the cell's price in the heading.
 * C — as built: no price in the dialog, the card already shows it.
 */
export function RegisterDialogPrototype({
  isSubmitting,
  onClose,
  seminar,
  submit,
  variant,
}: {
  isSubmitting: boolean;
  onClose: () => void;
  seminar: PortalMoneySeminar;
  submit: ReturnType<typeof useFetcher>["submit"];
  variant: DialogVariantId;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const form = useForm<RegisterPortalSeminarInscriptionFormValues>({
    resolver: zodResolver(registerPortalSeminarInscriptionSchema),
    defaultValues: { seminarId: seminar.id, person: "" },
  });
  const pickedId = useWatch({ control: form.control, name: "person" });
  const people = listRegistrablePeople(seminar);
  const picked =
    people.find((candidate) => candidate.person.id === pickedId) ?? null;

  return (
    <Dialog open onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
      <DialogContent
        ref={contentRef}
        overlayClassName="backdrop-blur-sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLElement>('[data-slot="combobox-trigger"]')
            ?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{seminar.instructorName}</DialogTitle>
          <DialogDescription>
            {formatPortalSeminarMoment(seminar)}
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          className="flex flex-col gap-5"
          onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
        >
          <input
            type="hidden"
            name="intent"
            value="register-seminar-inscription"
          />
          <input type="hidden" name="seminarId" value={seminar.id} />
          <FieldGroup>
            {variant === "B" ? (
              <ComboboxField
                control={form.control}
                emptyMessage="No hay nadie con ese nombre."
                inputPlaceholder="Buscar por nombre"
                label="Persona"
                name="person"
                groups={groupByParticipation(people, seminar)}
                placeholder="Elegí una persona del plantel"
              />
            ) : (
              <ComboboxField
                control={form.control}
                description={
                  variant === "A" && picked
                    ? describeWhatTheyPay(picked)
                    : undefined
                }
                emptyMessage="No hay nadie con ese nombre."
                inputPlaceholder="Buscar por nombre"
                label="Persona"
                name="person"
                groups={groupByRole(people)}
                placeholder="Elegí una persona del plantel"
              />
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton isPending={isSubmitting} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
