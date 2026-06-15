# Style Guide

Guía de estilo visual del producto. La base visual es shadcn/ui `radix-nova` con
sus componentes, tokens CSS y fuente del tema.

## Dirección visual

La interfaz debe priorizar claridad, lectura rápida y uso repetido por sobre una
estética de landing o espectáculo.

- Usar superficies claras, jerarquía nítida y contraste suficiente.
- Mantener la experiencia apta para formularios, listas, tablas y estados.
- Evitar fondos decorativos dominantes, degradados grandes, decoración
  ornamental y composición de marketing. No prohibir fondos oscuros cuando
  provengan del tema dark o de componentes shadcn.

## Color y tokens

Usar tokens semánticos de shadcn/ui como fuente de verdad. No hardcodear colores
Tailwind (`slate`, `red`, `teal`, etc.) salvo que exista una necesidad puntual
que no pueda expresarse con tokens o variantes existentes.

Reglas:

- Usar `background`, `foreground`, `muted`, `muted-foreground`, `border`,
  `input`, `ring`, `primary`, `primary-foreground`, `secondary`,
  `secondary-foreground`, `accent`, `accent-foreground`, `destructive`,
  `card` y `card-foreground`.
- Para estados negativos o errores, usar `destructive` y los estados inválidos
  de los componentes (`aria-invalid`, `data-invalid`).
- Para estados positivos, informativos o de advertencia, preferir variantes de
  componentes existentes (`Badge`, `Alert`). No agregar variantes propias ni
  tokens semánticos nuevos sin decisión explícita.
- No introducir paletas de marca, hex propios ni escalas paralelas sin decisión
  explícita.

## Radios

Usar los radios del tema (`--radius` y derivados) y las clases ya definidas por
los componentes. No corregir radios por pantalla con clases ad hoc salvo para
layout o composición local.

## Tipografía

Usar la fuente del tema shadcn actual. No agregar tipografías de marca ni
familias alternativas sin decisión explícita.

Crear jerarquía con componentes, variantes, peso y espaciado. Evitar clases
tipográficas manuales sobre componentes base cuando el componente ya define el
estilo.

## Densidad y layout

Usar densidad operativa media. La interfaz debe permitir escanear listas,
formularios y estados sin sentirse apretada.

Usar `gap-*` para spacing entre elementos. No usar `space-x-*` ni `space-y-*`.
Respetar tamaños y padding internos de componentes shadcn; ajustar con
`className` solo por layout.

Usar shells operativos para portal de academias, panel de administración y
juzgamiento. Las pantallas centradas quedan reservadas para autenticación,
errores y estados excepcionales.

Priorizar tablas para listas operativas en desktop. Usar cards para mobile o
elementos repetidos simples. Evitar dashboards con hero grande.

## Componentes base

Usar shadcn/ui `radix-nova` como base. Los componentes viven en
`app/components/ui` y se tratan como la fuente de verdad visual.

Reglas:

- Usar componentes existentes antes de crear markup custom.
- Si el componente shadcn necesario no está instalado y el patrón se repite o el
  caso encaja claramente con shadcn, agregar el componente antes de crear una
  variante custom.
- Usar variantes del componente antes de sobrescribir colores, radios,
  tipografía o estados con `className`.
- Usar `className` para layout: grid, flex, gap, ancho, margen y composición
  local.
- En código nuevo, no usar `space-x-*` ni `space-y-*`; usar `flex`/`grid` con
  `gap-*`.
- Preferir props responsive o variantes del componente cuando existan antes de
  recrear comportamiento con clases. Ejemplo: `Field orientation="responsive"`.
- Evitar hardcodear look visual en componentes shadcn: colores, radios, sombras,
  tipografía y estados. El hardcode de layout sí está permitido.
- Si no existe token, variante o componente para un caso único, se puede usar una
  clase puntual. Si el caso se repite, extraerlo a componente, variante o token.
- No instalar componentes sin uso concreto.
- Usar `lucide-react` para iconos y `data-icon` dentro de botones.
- Usar `cn()` para clases condicionales.

## Alertas y estados vacíos

Usar componentes shadcn para feedback y estados vacíos.

Reglas:

- Usar `Alert` para callouts, avisos, errores no asociados a un campo y mensajes
  de éxito persistentes en pantalla. Si `Alert` no está instalado y el caso lo
  necesita, agregarlo antes de crear markup custom.
- Usar `Empty` para estados sin datos con título, descripción y acción primaria.
  Si `Empty` no está instalado y el caso lo necesita, agregarlo antes de crear
  markup custom.
- Migrar callouts y estados vacíos existentes cuando se toque el archivo o en
  una pasada dedicada.

## Estados y badges

Usar `Badge` con variantes shadcn existentes. No crear variantes propias para
`success`, `warning`, `info` u otros estados por ahora.

Reglas:

- Usar `Badge` en vez de spans custom para estados.
- Usar `variant="destructive"` para estados negativos cuando corresponda.
- Para estados no negativos, usar variantes existentes como `default`,
  `secondary` u `outline`.
- Si más adelante un estado necesita color semántico propio por legibilidad
  operativa, definirlo como decisión explícita antes de agregar tokens o
  variantes.

## Botones

Usar `Button` y sus variantes (`default`, `secondary`, `outline`, `ghost`,
`destructive`, `link`) y tamaños (`xs`, `sm`, `default`, `lg`, `icon`,
`icon-xs`, `icon-sm`, `icon-lg`).

Usar una única acción primaria por zona visual. Las acciones destructivas deben
tener texto claro y confirmación cuando el efecto sea irreversible. Los botones
solo con icono deben tener nombre accesible y tooltip cuando el icono no sea
obvio.

## Formularios

Los formularios usan labels visibles arriba del campo. El placeholder puede
mostrar un ejemplo, pero nunca reemplaza al label.

Reglas:

- Usar los componentes de `app/components/ui/field.tsx` (`Field`,
  `FieldLabel`, `FieldContent`, `FieldError`, `FieldDescription`,
  `FieldGroup`, `FieldSeparator`, `FieldSet`, `FieldLegend`) para construir
  campos de formulario según corresponda.
- Usar `FieldGroup` para layout de campos; no `space-y-*`.
- Usar `Field orientation="responsive"` cuando el campo deba pasar de vertical a
  horizontal según ancho disponible.
- Marcar el contenedor con `data-invalid` cuando el campo tenga error, incluso
  si el error nace de validación cliente, para que label, input y mensaje
  compartan el estado visual.
- Mostrar errores con `FieldError` y estados `destructive`.
- Mostrar ayuda con `FieldDescription`.
- No depender solo de un asterisco para indicar obligatoriedad; usar copy claro
  cuando el contexto lo requiera.
- Respetar altura, borde, foco y estados de `Input`, `Checkbox`, `Select`,
  `DateOnlyField` y demás controles existentes.
- En formularios y filtros, cuando haga falta seleccionar múltiples opciones,
  usar `Combobox` multi-select en vez de listas largas de checkboxes. Si
  `Combobox` no está instalado y el caso lo necesita, agregarlo antes de crear
  markup custom.
- Usar `Checkbox` para booleanos simples que se envían en un formulario.
- Usar `Switch` para preferencias o configuración on/off. Si `Switch` no está
  instalado y el caso lo necesita, agregarlo antes de crear markup custom.
- Usar `Checkbox` para pocas opciones visibles cuando el conjunto sea corto y no
  sea un filtro ni una relación múltiple de configuración del Evento. Para
  listas largas, configuración del Evento, filtros y relaciones múltiples, usar
  `Combobox` multi-select.
- Usar `Select` de shadcn para selección simple. No usar `<select>` nativo ni
  `NativeSelect`.
- Usar `Textarea` de shadcn para texto multilínea. No usar `<textarea>` nativo
  estilizado a mano.
- Migrar selects y textareas nativos existentes cuando se toque el archivo o en
  una pasada dedicada.
- En formularios largos, separar por secciones con título chico. Evitar cards
  anidadas.

## React Hook Form

Usar React Hook Form para formularios con validación cliente, componentes
controlados, estado derivado o varios campos relacionados. Seguir el patrón de
shadcn para React Hook Form: `useForm`, Zod resolver, `Controller` cuando el
control lo necesite y componentes `Field`.

Reglas:

- Definir el schema con Zod y pasarlo a `useForm` mediante `zodResolver`.
- Reusar el mismo schema o reglas equivalentes en la acción server para no
  divergir entre cliente y servidor.
- Usar `Controller` con componentes controlados shadcn como `Select`,
  `Checkbox`, `Switch`, `Combobox`, date pickers y campos custom.
- Para inputs simples, preferir el patrón shadcn con `Controller` y spread de
  `field` cuando el formulario ya use React Hook Form. Mantener `register` solo
  en formularios simples donde no complique la consistencia.
- Mostrar errores con `FieldError`; marcar `data-invalid` en `Field` y
  `aria-invalid` en el control.
- Para `Select`, pasar `field.value` y `field.onChange` al componente `Select`,
  y poner `aria-invalid` en `SelectTrigger`.
- Para arrays dinámicos, usar `useFieldArray`, `FieldSet`, `FieldLegend` y
  `FieldDescription`; usar `field.id` como key.
- Integrar errores server con `form.setError` cuando la acción devuelve
  `fieldErrors`.
- Tipar handlers de submit como `React.SubmitEvent<HTMLFormElement>` o
  `React.SubmitEventHandler<HTMLFormElement>`. No usar `React.FormEvent` ni
  `React.FormEventHandler` para formularios: en React 19 esos tipos están
  deprecados porque no representan eventos reales de formulario.
- Migrar formularios manuales existentes a React Hook Form cuando se toque el
  archivo o en una pasada dedicada, priorizando formularios con validación
  cliente, selects, comboboxes, checkboxes múltiples y estado derivado.

## Acciones destructivas

Las acciones destructivas usan diálogos de confirmación. No usar formularios con
checkboxes de confirmación para destructivas.

Reglas:

- Confirmar la acción con copy claro en el diálogo.
- Usar `Button variant="destructive"` para la acción final.
- Mantener formularios complejos fuera de confirmaciones destructivas.
- Migrar destructivas existentes con checkbox cuando se toque el archivo o en
  una pasada dedicada.

## Navegación

Cada contexto usa un shell acorde a su intensidad operativa.

| Contexto                | Shell                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Panel de administración | Sidebar en desktop, topbar con usuario y acciones, navegación densa |
| Portal de academias     | Topbar con navegación secundaria o tabs                             |
| Juzgamiento             | Layout enfocado, topbar mínima, próxima presentación prominente     |
| Vistas públicas         | Topbar simple, contenido legible, filtros visibles                  |
| Autenticación           | Card centrada                                                       |

No usar un hero como estructura principal de navegación operativa.

Reglas:

- Usar `Sidebar` para navegación principal de administración.
- Usar `Breadcrumb` para jerarquía y ubicación dentro de rutas profundas.
- Usar `Tabs` para navegación secundaria entre vistas hermanas. Si `Tabs` no
  está instalado y el caso lo necesita, agregarlo antes de crear markup custom.
- Usar `DropdownMenu` para acciones contextuales.
- No construir navegación con botones o links estilizados a mano cuando exista un
  componente shadcn equivalente.

## Tablas y listas

Usar tablas como patrón default para listas operativas en desktop,
especialmente en administración. En mobile, adaptar a cards compactas o listas
stacked.

Reglas:

- Usar `Table` o componentes derivados como `DataTable` antes de crear tablas
  custom.
- Mantener estilos de header, hover, celdas y estados dentro del componente
  compartido cuando el patrón se repite.
- Usar badges para estados.
- Usar menú de acciones por fila cuando existan más de dos acciones.
- Mostrar acciones masivas solo cuando haya selección activa.
- Mantener filtros arriba en una barra compacta; usar panel grande solo para
  filtros avanzados.
- Usar header sticky solo en listas largas.

## Cards y paneles

Usar cards con moderación. No usarlas como estructura general de página.

Reglas:

- Card: item repetido, modal, autenticación, estado vacío o resumen puntual.
- Panel: agrupación de una sección de formulario o detalle.
- Section: bloque de página sin caja, separado por spacing y heading.
- No anidar cards dentro de cards.
- Usar `Card` para paneles visuales con borde o superficie.
- Usar `<section>` sin card cuando solo haga falta separación semántica o
  spacing.
- Si el panel tiene título o descripción, usar `CardHeader`, `CardTitle` y
  `CardDescription`.
- Si el panel solo agrupa contenido sin título propio, usar `CardContent`.
- Usar composición completa cuando corresponda: `CardHeader`, `CardTitle`,
  `CardDescription`, `CardContent`, `CardFooter`.
- No sobrescribir color, borde, radio o sombra de `Card` salvo necesidad local
  muy concreta.
- Migrar paneles custom con borde/superficie a `Card` cuando se toque el archivo
  o en una pasada dedicada.

## Texto de interfaz

Toda la interfaz visible usa español. Usar tono rioplatense neutro, directo y
operativo.

Reglas:

- Usar formas como `Ingresá`, `Revisá`, `Completá`.
- Evitar tono de marketing en flujos operativos.
- Nombrar botones con verbo y objeto cuando ayude: `Guardar cambios`,
  `Crear factura`, `Publicar resultados`.
- En estados vacíos, explicar causa y próxima acción disponible.
- En errores, indicar qué corregir. Usar mensajes genéricos solo como fallback.
- En administración, usar términos canónicos del glosario como `Coreografía`,
  `Presentación` y `Estado financiero`.
- En portal de academias, evitar jerga interna cuando no aporte a la acción.

## Tema

Mantener el tema shadcn `radix-nova` y sus tokens light/dark. No eliminar
soporte dark que venga de shadcn, pero tampoco diseñar una experiencia dark
custom ni agregar overrides `dark:` propios salvo necesidad concreta.

El producto puede operar en light por defecto. Si más adelante dark mode se
vuelve requisito, usar los tokens del tema en vez de hardcodear colores por
pantalla.
