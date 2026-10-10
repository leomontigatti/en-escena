import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";

const contactEmail = "certamen.enescena@gmail.com";

/**
 * The privacy policy, public and static: the page the Google sign-in's consent
 * screen (and Meta's, when it comes) links to. It describes what the system
 * keeps, so a change to the voter's stored fields changes this text too.
 */
export function PrivacyPolicyView() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background px-4">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 py-3">
          <EnEscenaAvatar />
          <span className="text-sm font-medium">En Escena</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <article className="mx-auto flex max-w-3xl flex-col gap-6 text-sm leading-relaxed">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Política de privacidad
            </h1>
            <p className="text-muted-foreground">
              Última actualización: 10 de octubre de 2026.
            </p>
          </div>

          <Section title="Votación de la Gran final">
            <p>
              Para votar en la Gran final podés ingresar con tu cuenta de
              Google. Solo pedimos el identificador de tu cuenta y tu email, y
              los usamos únicamente para asegurar que cada persona vote una sola
              vez. Del email guardamos solo una versión cifrada (hash), nunca la
              dirección.
            </p>
          </Section>

          <Section title="Inscripciones">
            <p>
              Las academias cargan en el sistema los datos de sus bailarines y
              profesores que hacen falta para inscribirse y organizar el evento.
              Esos datos se usan solo con ese fin.
            </p>
          </Section>

          <Section title="Terceros">
            <p>
              No vendemos ni compartimos estos datos con terceros, ni los usamos
              para enviarte publicidad.
            </p>
          </Section>

          <Section title="Contacto">
            <p>
              Para consultar tus datos o pedir que los borremos, escribinos a{" "}
              <a
                className="font-medium underline underline-offset-4"
                href={`mailto:${contactEmail}`}
              >
                {contactEmail}
              </a>
              .
            </p>
          </Section>
        </article>
      </main>
    </div>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
