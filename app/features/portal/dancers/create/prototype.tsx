// PROTOTYPE — throwaway, deleted before implementation.
// Two layouts of the full-page "Nuevo bailarín", switchable via `?variant=`:
// A puts every field in the form page's two-column grid, B splits the card
// into "Datos" and "Documento". Both share the typed birth date and the
// camera/gallery actions under each document image, which are what is being
// checked. Nothing is saved: a valid submit shows what the form would post.
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, ChevronLeft, ChevronRight, ImageUp } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  buildBirthDateRefinement,
  invalidBirthDateMessage,
} from "@/lib/dancers/birth-date";
import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";

// --- Birth date: typed dd/mm/aaaa ------------------------------------------

/** Day, month, 4-digit year; `/`, `-` or `.` between them. */
const argentineDatePattern = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d+)$/;

type ParsedDate =
  { ok: true; dateOnly: string } | { ok: false; message: string };

function parseArgentineDate(text: string): ParsedDate {
  const match = argentineDatePattern.exec(text.trim());

  if (!match) {
    return { ok: false, message: "Escribí la fecha como dd/mm/aaaa." };
  }

  const [, day, month, year] = match;

  if (year.length !== 4) {
    return { ok: false, message: "Escribí el año con 4 dígitos (ej: 2012)." };
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  // Round trip: 31/02 rolls over to March, so it fails here.
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return { ok: false, message: invalidBirthDateMessage };
  }

  return {
    ok: true,
    dateOnly: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
  };
}

/** Digits only, `/` after the day and the month: `15032012` → `15/03/2012`. */
function maskDigits(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);

  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter(Boolean)
    .join("/");
}

function BirthDateInputField({
  control,
}: {
  control: Control<PrototypeValues>;
}) {
  const id = useId();

  return (
    <Controller
      control={control}
      name="birthDate"
      render={({ field, fieldState }) => (
        <SharedFieldLayout
          error={fieldState.error?.message}
          id={id}
          label="Fecha de nacimiento"
        >
          {({ describedBy, isInvalid }) => (
            <Input
              ref={field.ref}
              id={id}
              name={field.name}
              value={field.value}
              inputMode="numeric"
              autoComplete="bday"
              placeholder="dd/mm/aaaa"
              aria-describedby={describedBy || undefined}
              aria-invalid={isInvalid ? true : undefined}
              onBlur={field.onBlur}
              onChange={(event) =>
                field.onChange(maskDigits(event.target.value))
              }
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                // Backspace right after a slash takes the digit before it too,
                // or the mask would put the slash straight back.
                const { selectionStart, selectionEnd, value } =
                  event.currentTarget;
                if (
                  event.key === "Backspace" &&
                  selectionStart === selectionEnd &&
                  selectionStart !== null &&
                  value[selectionStart - 1] === "/"
                ) {
                  event.preventDefault();
                  field.onChange(
                    maskDigits(
                      value.slice(0, selectionStart - 2) +
                        value.slice(selectionStart),
                    ),
                  );
                }
              }}
              onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                // A pasted `1/3/2012` keeps its separators' meaning.
                const parsed = parseArgentineDate(
                  event.clipboardData.getData("text"),
                );
                if (parsed.ok) {
                  event.preventDefault();
                  const [year, month, day] = parsed.dateOnly.split("-");
                  field.onChange(`${day}/${month}/${year}`);
                }
              }}
            />
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

// --- Document image: camera or gallery --------------------------------------

/**
 * The shared dropzone, plus "Tomar foto" and "Subir imagen" on touch screens.
 * Both actions open the field's own file input, so the picked file posts the
 * same way; "Tomar foto" sets `capture` first, which opens the rear camera.
 * Android's photo picker offers no camera without it.
 */
function DocumentImageField({
  control,
  fieldLabel,
  fileInputName,
  name,
}: {
  control: Control<PrototypeValues>;
  fieldLabel: string;
  fileInputName: string;
  name: "documentFrontImageStorageKey" | "documentBackImageStorageKey";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isTouch = useIsTouch();

  function openPicker(capture: boolean) {
    const input =
      containerRef.current?.querySelector<HTMLInputElement>(
        'input[type="file"]',
      );
    if (!input) return;
    if (capture) {
      input.setAttribute("capture", "environment");
    } else {
      input.removeAttribute("capture");
    }
    input.click();
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <FileUploadField
        control={control}
        name={name}
        fileInputName={fileInputName}
        fieldLabel={fieldLabel}
        {...getAssetUploadFieldProps("dancerDocumentImage")}
        // On a touch screen the zone only shows the image, or its absence:
        // the two buttons below are the only way in.
        label={isTouch ? "Sin imagen" : "Arrastrá o hacé click"}
        className={
          isTouch
            ? "pointer-events-none min-h-28 [&>span:first-of-type]:hidden"
            : undefined
        }
      />
      <div className="hidden gap-2 pointer-coarse:grid pointer-coarse:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => openPicker(true)}
        >
          <Camera aria-hidden="true" data-icon="inline-start" />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => openPicker(false)}
        >
          <ImageUp aria-hidden="true" data-icon="inline-start" />
          Subir imagen
        </Button>
      </div>
    </div>
  );
}

function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    setIsTouch(query.matches);
    const onChange = () => setIsTouch(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}

// --- Form ---------------------------------------------------------------------

function buildPrototypeSchema(eventStartDate: string | null) {
  const refineBirthDate = buildBirthDateRefinement(eventStartDate);

  return z.object({
    firstName: z.string().trim().min(1, "Este campo es obligatorio."),
    lastName: z.string().trim().min(1, "Este campo es obligatorio."),
    birthDate: z
      .string()
      .trim()
      .min(1, "Este campo es obligatorio.")
      .superRefine((value, context) => {
        const parsed = parseArgentineDate(value);
        if (!parsed.ok) {
          context.addIssue({ code: "custom", message: parsed.message });
          return;
        }
        refineBirthDate(parsed.dateOnly, context);
      }),
    documentType: z.string(),
    documentNumber: z.string().trim(),
    documentFrontImageStorageKey: z.string(),
    documentBackImageStorageKey: z.string(),
  });
}

type PrototypeValues = z.infer<ReturnType<typeof buildPrototypeSchema>>;

const emptyValues: PrototypeValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
  documentType: "",
  documentNumber: "",
  documentFrontImageStorageKey: "",
  documentBackImageStorageKey: "",
};

type FieldsProps = { control: Control<PrototypeValues> };

function NameFields({ control }: FieldsProps) {
  return (
    <>
      <TextInputField
        autoComplete="given-name"
        control={control}
        label="Nombre"
        name="firstName"
      />
      <TextInputField
        autoComplete="family-name"
        control={control}
        label="Apellido"
        name="lastName"
      />
    </>
  );
}

function DocumentFields({ control }: FieldsProps) {
  return (
    <>
      <SelectField
        allowEmpty
        control={control}
        emptyLabel={documentTypeEmptyLabel}
        label="Tipo de documento"
        name="documentType"
        options={documentTypeOptions}
        placeholder={documentTypeEmptyLabel}
      />
      <TextInputField
        autoComplete="off"
        control={control}
        label="Número de documento"
        name="documentNumber"
      />
    </>
  );
}

function ImageFields({ control }: FieldsProps) {
  return (
    <>
      <DocumentImageField
        control={control}
        name="documentFrontImageStorageKey"
        fileInputName="documentFrontImage"
        fieldLabel="Imagen frente del documento"
      />
      <DocumentImageField
        control={control}
        name="documentBackImageStorageKey"
        fileInputName="documentBackImage"
        fieldLabel="Imagen dorso del documento"
      />
    </>
  );
}

/** A: the form page's grid, every field in it. */
function VariantA({ control }: FieldsProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <NameFields control={control} />
      <BirthDateInputField control={control} />
      <div className="hidden md:block" />
      <DocumentFields control={control} />
      <ImageFields control={control} />
    </div>
  );
}

/** B: two titled sections, the document and its images together. */
function VariantB({ control }: FieldsProps) {
  return (
    <div className="flex flex-col gap-6">
      <PrototypeSection title="Datos del bailarín">
        <NameFields control={control} />
        <BirthDateInputField control={control} />
      </PrototypeSection>
      <FieldSeparator />
      <PrototypeSection
        title="Documento"
        description="Opcional al registrarlo. Sin las imágenes el bailarín queda incompleto."
      >
        <DocumentFields control={control} />
        <ImageFields control={control} />
      </PrototypeSection>
    </div>
  );
}

function PrototypeSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

const variants = [
  { key: "A", name: "Una grilla" },
  { key: "B", name: "Dos secciones" },
] as const;

export function DancerCreatePrototype({
  eventStartDate,
}: {
  eventStartDate: string | null;
}) {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant") === "B" ? "B" : "A";
  const [posted, setPosted] = useState<Record<string, string> | null>(null);
  const form = useForm<PrototypeValues>({
    resolver: zodResolver(buildPrototypeSchema(eventStartDate)),
    defaultValues: emptyValues,
    mode: "onSubmit",
  });

  return (
    <section
      aria-labelledby="nuevo-bailarin-title"
      className="flex flex-1 flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h2 id="nuevo-bailarin-title" className="text-xl font-semibold">
          Nuevo bailarín
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Cargá sus datos y, si los tenés a mano, las fotos del documento.
        </p>
      </header>

      <form
        noValidate
        encType="multipart/form-data"
        onSubmit={form.handleSubmit((values) => {
          const parsed = parseArgentineDate(values.birthDate);
          setPosted({
            ...values,
            birthDate: parsed.ok ? parsed.dateOnly : values.birthDate,
          });
        })}
      >
        <Card className="overflow-clip">
          <CardContent>
            {variant === "A" ? (
              <VariantA control={form.control} />
            ) : (
              <VariantB control={form.control} />
            )}
          </CardContent>
          <PinnedActions>
            <Button asChild variant="outline">
              <Link to="/portal/bailarines">Cancelar</Link>
            </Button>
            <SubmitButton isPending={false} />
          </PinnedActions>
        </Card>
      </form>

      {posted ? (
        <pre className="rounded-lg bg-muted p-4 text-xs">
          {`Se enviaría (y redirigiría a /portal/bailarines):\n${JSON.stringify(posted, null, 2)}`}
        </pre>
      ) : null}

      <PrototypeSwitcher current={variant} />
    </section>
  );
}

function PrototypeSwitcher({ current }: { current: "A" | "B" }) {
  const [, setSearchParams] = useSearchParams();
  const index = variants.findIndex((variant) => variant.key === current);

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length];
    setSearchParams({ variant: next.key }, { replace: true });
  }

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-background shadow-lg">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Variante anterior"
        onClick={() => go(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="text-sm">
        {current} ({variants[index].name})
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Variante siguiente"
        onClick={() => go(1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
