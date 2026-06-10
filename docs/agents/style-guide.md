# Style Guide

Guía de estilo visual para En Escena. Define tokens y reglas generales para que
portal de academias, panel de administración, vistas públicas y juzgamiento
compartan un mismo lenguaje visual.

## Dirección visual

En Escena usa una dirección operativa, sobria y liviana. La interfaz debe
priorizar claridad, lectura rápida y uso repetido por sobre una estética de
landing o espectáculo.

- Usar superficies claras, jerarquía nítida y contraste suficiente.
- Mantener la experiencia apta para formularios, listas, tablas y estados.
- Evitar fondos oscuros dominantes, degradados grandes, decoración ornamental y
  composición de marketing.

## Color

### Primario

`#55C594` es el color de marca. No debe usarse como fondo de botón con texto
blanco normal porque no alcanza contraste suficiente.

| Token         | Hex       | Uso                                  |
| ------------- | --------- | ------------------------------------ |
| `primary-50`  | `#F1FBF6` | Fondos suaves                        |
| `primary-100` | `#DDF7EA` | Fondos suaves, estados seleccionados |
| `primary-200` | `#BEEED6` | Focus ring, bordes activos suaves    |
| `primary-300` | `#8FDFB8` | Highlights secundarios               |
| `primary-400` | `#55C594` | Marca, iconos, acentos               |
| `primary-500` | `#2FA875` | Acentos fuertes                      |
| `primary-600` | `#16865B` | Acción primaria accesible            |
| `primary-700` | `#0F6B49` | Hover de acción primaria             |
| `primary-800` | `#0D553C` | Texto sobre fondos primarios suaves  |
| `primary-900` | `#0B4633` | Texto fuerte                         |
| `primary-950` | `#05271E` | Texto máximo contraste               |

### Neutros

Usar una escala fría tipo slate como base. Evitar `stone` como neutral principal
para que la app no se lea cálida, spa o eco.

| Token         | Hex       |
| ------------- | --------- |
| `neutral-50`  | `#F8FAFC` |
| `neutral-100` | `#F1F5F9` |
| `neutral-200` | `#E2E8F0` |
| `neutral-300` | `#CBD5E1` |
| `neutral-400` | `#94A3B8` |
| `neutral-500` | `#64748B` |
| `neutral-600` | `#475569` |
| `neutral-700` | `#334155` |
| `neutral-800` | `#1E293B` |
| `neutral-900` | `#0F172A` |
| `neutral-950` | `#020617` |

## Radios

Usar radios chicos a medios. Evitar radios grandes como default porque reducen
densidad y hacen que pantallas operativas parezcan marketing o consumer app.

| Token       | Valor  | Uso                                |
| ----------- | ------ | ---------------------------------- |
| `radius-sm` | `4px`  | Badges chicos, elementos internos  |
| `radius-md` | `6px`  | Botones, inputs, filtros           |
| `radius-lg` | `8px`  | Cards, paneles, modales            |
| `radius-xl` | `12px` | Contenedores grandes excepcionales |

`radius-lg` es el máximo normal. `radius-xl` requiere una razón visual concreta.

## Tipografía

Usar Inter como única tipografía base. Es adecuada para interfaces densas,
formularios, tablas y paneles operativos. No usar una tipografía decorativa para
marca en la primera versión.

| Token       | Tamaño | Uso                                                     |
| ----------- | ------ | ------------------------------------------------------- |
| `text-xs`   | `12px` | Metadata, badges, ayudas breves                         |
| `text-sm`   | `14px` | UI default, labels, tablas                              |
| `text-base` | `16px` | Texto largo, formularios cómodos                        |
| `text-lg`   | `18px` | Subtítulos                                              |
| `text-xl`   | `20px` | Títulos de sección                                      |
| `text-2xl`  | `24px` | Títulos de página                                       |
| `text-3xl`  | `30px` | Pantallas de autenticación o estados vacíos importantes |

Crear jerarquía con peso, tamaño y espaciado. Evitar combinar familias
tipográficas salvo que una decisión de marca posterior lo justifique.

## Densidad y layout

Usar densidad operativa media. La interfaz debe permitir escanear listas,
formularios y estados sin sentirse apretada.

| Elemento                     | Regla           |
| ---------------------------- | --------------- |
| Padding de página en desktop | `24px` a `32px` |
| Padding de página en mobile  | `16px`          |
| Separación entre secciones   | `24px`          |
| Padding de card o panel      | `16px` a `24px` |
| Separación entre campos      | `16px`          |
| Alto de fila de tabla        | `44px` a `52px` |
| Alto de botón normal         | `36px` a `40px` |
| Alto de botón touch/auth     | `44px`          |

Usar shells operativos para portal de academias, panel de administración y
juzgamiento. Las pantallas centradas quedan reservadas para autenticación,
errores y estados excepcionales.

Priorizar tablas para listas operativas en desktop. Usar cards para mobile o
elementos repetidos simples. Evitar dashboards con hero grande.

## Estados semánticos

No usar el color primario como reemplazo de estados semánticos. `primary`
representa marca y acción principal; `success` representa resultado positivo.

| Estado    | Color base | Uso                                                        |
| --------- | ---------- | ---------------------------------------------------------- |
| `success` | Emerald    | Guardado, pago imputado, completo, publicado               |
| `info`    | Sky        | Información, programa visible, instrucciones               |
| `warning` | Amber      | Pendiente, incompleto, fuera de período, requiere revisión |
| `danger`  | Red        | Error, anulación, descalificación, acción irreversible     |
| `neutral` | Slate      | Borrador, no iniciado, sin presentación                    |

Los badges y alerts deben combinar fondo suave, borde sutil y texto oscuro de la
misma familia para mantener contraste y legibilidad.

## Componentes base

Adoptar shadcn/ui de forma selectiva, con tokens propios de En Escena. No usar el
theme default sin adaptar y no instalar componentes que no tengan uso concreto.

Componentes iniciales recomendados:

- `Button`
- `Input`
- `Label`
- `Textarea`
- `Select`
- `Dialog`
- `DropdownMenu`
- `Tabs`
- `Table`
- `Badge`
- `Alert`

Ubicar componentes base en `app/components/ui`. Usar `class-variance-authority`
para variantes, `tailwind-merge` para composición de clases y `lucide-react` para
iconos.

## Botones

Variantes base:

| Variante      | Estilo                                                 |
| ------------- | ------------------------------------------------------ |
| `primary`     | Fondo `primary-600`, texto blanco, hover `primary-700` |
| `secondary`   | Fondo blanco, borde `neutral-300`, texto `neutral-900` |
| `ghost`       | Fondo transparente, hover `neutral-100`                |
| `destructive` | Fondo rojo accesible, texto blanco                     |
| `link`        | Texto `primary-700`, sin caja                          |

Tamaños:

| Tamaño    | Regla                                                         |
| --------- | ------------------------------------------------------------- |
| `sm`      | Alto `32px`, padding horizontal `12px`, texto `14px`          |
| `default` | Alto `36px`, padding horizontal `16px`, texto `14px`          |
| `lg`      | Alto `44px`, padding horizontal `20px`, texto `14px` o `16px` |
| `icon`    | `36px` por `36px`                                             |

Usar una única acción primaria por zona visual. Las acciones destructivas deben
tener texto claro y confirmación cuando el efecto sea irreversible. Los botones
solo con icono deben tener nombre accesible y tooltip cuando el icono no sea
obvio.

## Formularios

Los formularios usan labels visibles arriba del campo. El placeholder puede
mostrar un ejemplo, pero nunca reemplaza al label.

Reglas:

- Mostrar errores debajo del campo con texto `danger` y borde `danger`.
- Mostrar ayuda debajo del campo con `neutral-500`.
- No depender solo de un asterisco para indicar obligatoriedad; usar copy claro
  cuando el contexto lo requiera.
- Usar alto `40px` para inputs normales y `44px` para auth o superficies touch.
- En foco, usar borde `primary-600` y ring `primary-200`.
- En formularios largos, separar por secciones con título chico. Evitar cards
  anidadas.

Estilo base:

| Elemento  | Estilo                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Label     | `text-sm`, peso medio, `neutral-800`                                       |
| Input     | `rounded-md`, borde `neutral-300`, fondo blanco, padding horizontal `12px` |
| Help text | `text-xs`, `neutral-500`                                                   |
| Error     | `text-xs`, rojo accesible                                                  |

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

## Tablas y listas

Usar tablas como patrón default para listas operativas en desktop,
especialmente en administración. En mobile, adaptar a cards compactas o listas
stacked.

Reglas:

- Header con fondo `neutral-50`, texto `neutral-600`, tamaño `12px` o `14px`.
- Filas con hover `neutral-50`.
- Alto de fila entre `44px` y `52px`.
- Padding horizontal de celda entre `12px` y `16px`.
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
- Usar borde `neutral-200`, fondo blanco y radio `8px`.
- Usar sombra mínima solo cuando ayude a separar elevación real.

Estilo base:

| Patrón  | Estilo                                                    |
| ------- | --------------------------------------------------------- |
| Card    | Borde, fondo blanco, `rounded-lg`, `shadow-sm` opcional   |
| Panel   | Borde, fondo blanco, `rounded-lg`, sin sombra por defecto |
| Section | Sin caja, solo spacing y heading                          |

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

La primera versión es light-only. Mantener `color-scheme: light` y evitar
implementar dark mode hasta que exista un requisito explícito.

Preparar tokens de color no implica diseñar dos temas. Agregar dark mode ahora
duplicaría QA visual en formularios, tablas, estados y flujos de juzgamiento.
