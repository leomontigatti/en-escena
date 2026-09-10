// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the tier table and tier dialog of variant A.
import { Plus } from "lucide-react";
import { useState } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";
import { AdminEmptyState } from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FieldLockIcon } from "@/components/shared/field-lock-icon";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPaymentDeadlineForTable } from "@/features/admin/prices/view-shared";
import { formatAmount } from "@/lib/finances/formatters";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  depositFor,
  formatTierLabel,
  type PrototypeSeminar,
  type SeminarTier,
  type TierUsage,
} from "./seminar-money-fixtures.prototype";

type Record = (entry: string) => void;

/** Variant A's `Precios` tab: the tiers as a table, edited in a dialog. */
export function SeminarTierTable({
  record,
  seminar,
  tierUsage,
}: {
  record: Record;
  seminar: PrototypeSeminar;
  tierUsage: { [tierId: string]: TierUsage };
}) {
  const [editing, setEditing] = useState<SeminarTier | "new" | null>(null);
  const rate = seminar.requiredDepositPercentage;
  const columns: DataTableColumn<SeminarTier>[] = [
    {
      id: "paymentDeadline",
      header: "Fecha límite",
      className: "font-medium",
      cell: (tier) => (
        <Button
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={() => setEditing(tier)}
        >
          {formatPaymentDeadlineForTable(tier.paymentDeadline)}
        </Button>
      ),
      sortValue: (tier) => tier.paymentDeadline ?? "9999-12-31",
    },
    {
      id: "participantAmount",
      header: "Precio participante",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (tier) => formatAmount(tier.participantAmount),
    },
    {
      id: "nonParticipantAmount",
      header: "Precio no participante",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (tier) => formatAmount(tier.nonParticipantAmount),
    },
    {
      id: "deposit",
      header: `Seña (${rate}%)`,
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (tier) =>
        `${formatAmount(depositFor(tier.participantAmount, rate))} / ${formatAmount(
          depositFor(tier.nonParticipantAmount, rate),
        )}`,
    },
    {
      id: "usage",
      header: "Inscripciones",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (tier) => {
        const usage = tierUsage[tier.id];

        return (
          <span className="inline-flex items-center gap-1.5">
            {usage?.heldByCovered ? <FieldLockIcon className="size-3" /> : null}
            {usage?.referencedCount ?? 0}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          Nuevo precio
        </Button>
      </div>
      {seminar.tiers.length > 0 ? (
        <ClientDataTable<SeminarTier>
          rows={seminar.tiers}
          hideSearch
          searchPlaceholder="Buscar precio"
          columns={columns}
          getRowKey={(tier) => tier.id}
          emptyMessage="No hay precios para mostrar."
          initialSort={{ columnId: "paymentDeadline", direction: "asc" }}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay precios para este seminario."
          description="Creá el primer precio: sin precios, las inscripciones se registran pero no se pueden cobrar."
        />
      )}
      {editing ? (
        <SeminarTierDialog
          onOpenChange={(open) => (open ? null : setEditing(null))}
          rate={rate}
          record={record}
          tier={editing === "new" ? null : editing}
          usage={editing === "new" ? undefined : tierUsage[editing.id]}
        />
      ) : null}
    </div>
  );
}

type TierDialogValues = {
  isOpenEnded: boolean;
  nonParticipantAmount: string;
  participantAmount: string;
  paymentDeadline: string;
};

/**
 * The tier dialog of variant A, laid out as the event price form: the deadline
 * with the open-ended switch in its label row, then the two amounts side by
 * side. Deleting sits at the far side of the footer, as `Quitar dinero` does in
 * the money dialog, and goes through the shared `DeleteDialog`, blocked while
 * any inscription stores the tier (#885 guard 1).
 */
function SeminarTierDialog({
  onOpenChange,
  rate,
  record,
  tier,
  usage,
}: {
  onOpenChange: (open: boolean) => void;
  rate: number;
  record: Record;
  tier: SeminarTier | null;
  usage: TierUsage | undefined;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const isHeld = usage?.heldByCovered ?? false;
  const referencedCount = usage?.referencedCount ?? 0;
  const form = useForm<TierDialogValues>({
    defaultValues: {
      isOpenEnded: tier !== null && tier.paymentDeadline === null,
      nonParticipantAmount: tier ? String(tier.nonParticipantAmount) : "",
      participantAmount: tier ? String(tier.participantAmount) : "",
      paymentDeadline: tier?.paymentDeadline ?? "",
    },
  });
  const isOpenEnded = useWatch({ control: form.control, name: "isOpenEnded" });
  const onSubmit = form.handleSubmit((values) => {
    let isValid = true;

    if (!values.isOpenEnded && values.paymentDeadline === "") {
      form.setError("paymentDeadline", { message: requiredFieldMessage });
      isValid = false;
    }

    for (const key of ["participantAmount", "nonParticipantAmount"] as const) {
      if (values[key] === "") {
        form.setError(key, { message: requiredFieldMessage });
        isValid = false;
      }
    }

    if (
      Number(values.participantAmount) > Number(values.nonParticipantAmount)
    ) {
      form.setError("participantAmount", {
        message: "No puede superar al precio no participante.",
      });
      isValid = false;
    }

    if (!isValid) {
      return;
    }

    toast.success("Prototipo: se habría guardado el precio.");
    record(`Guardar precio → ${JSON.stringify({ id: tier?.id, ...values })}`);
    onOpenChange(false);
  });

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tier ? "Editar precio" : "Nuevo precio"}</DialogTitle>
            <DialogDescription>
              La seña es el {rate}% del precio que le corresponde a cada
              inscripción.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => void onSubmit(event)}
          >
            <FieldGroup>
              <DateOnlyField
                control={form.control}
                name="paymentDeadline"
                id="prototype-tier-dialog-deadline"
                label="Fecha límite de pago"
                disabled={isOpenEnded}
                buttonClassName="w-full"
                labelAdornment={<OpenEndedSwitch form={form} />}
              />
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <IntegerInputField
                  control={form.control}
                  label="Precio participante"
                  min={1}
                  name="participantAmount"
                  step={1}
                  disabled={isHeld}
                />
                <IntegerInputField
                  control={form.control}
                  label="Precio no participante"
                  min={1}
                  name="nonParticipantAmount"
                  step={1}
                  disabled={isHeld}
                />
              </FieldGroup>
              {isHeld ? (
                <FieldDescription>
                  Hay inscripciones con la seña cubierta con este precio: el
                  importe no se puede cambiar. Creá un precio nuevo si necesitás
                  otro.
                </FieldDescription>
              ) : null}
            </FieldGroup>
            <DialogFooter className={tier ? "sm:justify-between" : ""}>
              {tier ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setIsDeleting(true)}
                >
                  Eliminar
                </Button>
              ) : null}
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <SubmitButton isPending={false} />
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {tier && isDeleting ? (
        <DeleteDialog
          title={formatTierLabel(tier)}
          description="Esta acción elimina el precio del seminario. No se puede deshacer."
          isBlocked={referencedCount > 0}
          blockedTitle="No se puede eliminar este precio"
          blockedDescription={`Lo tienen guardado ${referencedCount} inscripciones. Si necesitás otro importe, creá un precio nuevo.`}
          intentValue="delete-seminar-price"
          recordId={tier.id}
          open
          onOpenChange={(open) => (open ? null : setIsDeleting(false))}
        />
      ) : null}
    </>
  );
}

function OpenEndedSwitch({ form }: { form: UseFormReturn<TierDialogValues> }) {
  return (
    <Controller
      control={form.control}
      name="isOpenEnded"
      render={({ field }) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Switch
                aria-label="Sin fecha límite"
                checked={field.value}
                onBlur={field.onBlur}
                onCheckedChange={(checked) => {
                  field.onChange(checked);

                  if (checked) {
                    form.setValue("paymentDeadline", "");
                    form.clearErrors("paymentDeadline");
                  }
                }}
              />
            </TooltipTrigger>
            <TooltipContent>Sin fecha límite</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    />
  );
}
