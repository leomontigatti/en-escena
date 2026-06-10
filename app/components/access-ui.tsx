import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { clsx } from "clsx";

const inputClassName =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm transition-[border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-teal-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus-visible:border-red-600 aria-[invalid=true]:focus-visible:ring-red-100";

export const accessButtonClassName =
  "inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";

export const accessSecondaryLinkClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";

export const accessTextLinkClassName =
  "rounded-sm font-medium text-teal-700 underline-offset-4 hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";

type AccessPageProps = {
  children: ReactNode;
  width?: "md" | "lg" | "xl";
};

export function AccessPage({ children, width = "md" }: AccessPageProps) {
  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-white focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-slate-950 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        Saltar al contenido principal
      </a>
      <main
        id="contenido-principal"
        className="grid min-h-screen place-items-center overflow-x-hidden bg-slate-100 px-4 py-8 sm:px-6 sm:py-12"
      >
        <section
          className={clsx(
            "w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8",
            width === "md" && "max-w-md",
            width === "lg" && "max-w-lg",
            width === "xl" && "max-w-4xl",
          )}
        >
          {children}
        </section>
      </main>
    </>
  );
}

type AccessHeaderProps = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  tone?: "default" | "danger";
};

export function AccessHeader({
  eyebrow,
  title,
  description,
  tone = "default",
}: AccessHeaderProps) {
  return (
    <header>
      <p
        className={clsx(
          "text-sm font-medium",
          tone === "danger" ? "text-red-700" : "text-teal-700",
        )}
      >
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-pretty text-slate-950">
        {title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-pretty text-slate-600">
        {description}
      </p>
    </header>
  );
}

type AccessFieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  inputProps: Omit<
    ComponentProps<"input">,
    "id" | "className" | "aria-describedby" | "aria-invalid"
  >;
};

export function AccessField({
  id,
  label,
  error,
  hint,
  inputProps,
}: AccessFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm leading-5 text-slate-600">
          {hint}
        </p>
      ) : null}
      <input
        {...inputProps}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={inputClassName}
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm leading-5 text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type AccessNoticeProps = {
  children: ReactNode;
  variant: "error" | "info" | "success";
};

export function AccessNotice({ children, variant }: AccessNoticeProps) {
  return (
    <p
      aria-live="polite"
      className={clsx(
        "rounded-lg px-4 py-3 text-sm leading-6",
        variant === "success" && "bg-emerald-50 text-emerald-800",
        variant === "info" && "bg-sky-50 text-sky-800",
        variant === "error" && "bg-red-50 text-red-800",
      )}
    >
      {children}
    </p>
  );
}

type AccessTextLinkProps = ComponentProps<typeof Link>;

export function AccessTextLink({ className, ...props }: AccessTextLinkProps) {
  return (
    <Link {...props} className={clsx(accessTextLinkClassName, className)} />
  );
}

type AccessSecondaryLinkProps = ComponentProps<typeof Link>;

export function AccessSecondaryLink({
  className,
  ...props
}: AccessSecondaryLinkProps) {
  return (
    <Link
      {...props}
      className={clsx(accessSecondaryLinkClassName, className)}
    />
  );
}
