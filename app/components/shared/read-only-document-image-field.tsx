import { ExternalLink, Lock } from "lucide-react";
import { useId } from "react";

import { Field, FieldContent, FieldLabel } from "@/components/ui/field";

export type DocumentImageFieldName =
  | "documentBackImageStorageKey"
  | "documentFrontImageStorageKey";

export function ReadOnlyDocumentImageField({
  label,
  name,
  storageKey,
  url,
}: {
  label: string;
  name?: DocumentImageFieldName;
  storageKey: string | null;
  url: string | null;
}) {
  const id = useId();
  const hasImage = Boolean(storageKey);

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        {name ? (
          <input type="hidden" name={name} value={storageKey ?? ""} />
        ) : null}
        <div className="relative">
          <div
            id={id}
            className="flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-input/50 px-2.5 py-1 pr-9 text-base opacity-50 md:text-sm"
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="truncate">Abrir imagen</span>
              </a>
            ) : (
              <span className="truncate">
                {hasImage ? "Imagen no disponible" : "Sin imagen"}
              </span>
            )}
          </div>
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}
