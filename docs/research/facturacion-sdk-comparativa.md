# Facturación electrónica ARCA — comparativa de SDKs y recomendación

Investigación para el mapa wayfinder de facturación electrónica (issue #322).
Objetivo: decidir entre un "SDK" de terceros hosteado, una librería open source
self-contained, o integración directa contra los web services de ARCA (ex AFIP),
priorizando que **la clave privada del certificado nunca salga de nuestra
infraestructura**.

Fecha de investigación: 2026-07-18. Todas las afirmaciones están citadas con su
fuente primaria (URL). Los precios y métricas pueden cambiar; verificar en la
fuente antes de decidir.

## TL;DR / Recomendación

**Recomendado: librería open source self-contained — `@arcasdk/core` (el proyecto
detrás de afipts.com), o como fallback la integración directa contra los WS de
ARCA.**

`afipts.com` **no** es un SaaS ni un servicio hosteado: es el sitio de
documentación de `@arcasdk/core`, una biblioteca TypeScript MIT que corre
íntegramente dentro de nuestro proceso Node, firma WSAA localmente y va
**directo a ARCA sin intermediarios**. El certificado y la clave privada se
pasan por variables de entorno y no salen de nuestra infra.

En cambio `@afipsdk/afip.js` (afipsdk.com) es un **cliente de una API hosteada**:
todas las operaciones —incluida la autenticación WSAA con el certificado y la
clave— se envían a `https://app.afipsdk.com/api/`. Eso viola el requisito de que
la clave privada no salga de nuestra infraestructura, además de sumar un
tercero de pago en el camino crítico de facturación.

## 1. afipts.com — qué es exactamente

- **No es un servicio ni una API propia.** Es el sitio de documentación de un
  SDK open source. El home se titula "Tu conexión directa con ARCA — Biblioteca
  TypeScript moderna para integrar facturación electrónica, padrón y demás
  servicios de ARCA (ex AFIP) en Node.js — sin intermediarios, con tipos
  completos", con badges "Open Source · MIT · Sin costos" y "Directo a ARCA ·
  Sin intermediarios". Fuente: https://www.afipts.com/
- **Paquete y repo.** Se instala como `@arcasdk/core` (`npm i @arcasdk/core`).
  Repositorio: https://github.com/ralcorta/arcasdk (autor Rodrigo Alcorta,
  `ralcorta`). Fuente: https://www.afipts.com/ y
  https://github.com/ralcorta/arcasdk
- **Historia del nombre.** El repo fue renombrado; antes era `afip.ts`. El README
  aclara: "El repositorio ha sido renombrado y el paquete ahora se publica como
  `@arcasdk/core`. El código original de `afip.ts` se encuentra preservado en la
  rama `afip.ts` y el paquete sigue disponible en npm como `afip.ts`." Es decir,
  `afip.ts` y `@arcasdk/core` son el mismo linaje de proyecto. Fuente:
  https://github.com/ralcorta/arcasdk
- **Cobertura funcional** (fuente: https://www.afipts.com/ y
  https://www.afipts.com/services/facturacion_electronica.html):
  - **WSAA automático**: "Gestión de tickets de acceso, renovación de tokens y
    cache configurable. Vos solo pasás cert y key."
  - **WSFEv1 (Facturación Electrónica)**: emisión y autorización de comprobantes
    (CAE), CAEA, notas de crédito.
  - **WSFEX** (facturación de exportación), **WSFECred / FCE MiPyMEs**, **Consulta
    de Padrón (alcance 4)**, **Constancia de inscripción**, y un **cliente SOAP
    genérico** para cualquier WSDL de ARCA.
  - **Factura C de monotributo: sí.** La tabla de `CbteTipo` incluye
    explícitamente `11 | Factura C` (y `211 | Factura de Crédito MiPyMEs (FCE) C`).
    Fuente: https://www.afipts.com/services/facturacion_electronica.html
  - **Homologación / testing**: guías para obtener y habilitar certificados de
    testing y autorizar el web service de testing. Fuente:
    https://www.afipts.com/tutorial/obtain-testing-certificate.html
  - **PDF**: paquete adicional `@arcasdk/pdf` que genera comprobantes A, B, C, E,
    M. Fuente: https://github.com/ralcorta/arcasdk

## 2. Stack, portabilidad y manejo del certificado

- **Usable desde Node/TypeScript: sí, nativamente.** Es TypeScript con tipos
  completos, targetea Node 22 y se anuncia "serverless ready" (AWS Lambda,
  Vercel, Cloudflare Workers, contenedores). Fuente: https://www.afipts.com/
- **¿La clave privada sale a un tercero? No.** El certificado y la clave se pasan
  como config local (p. ej. `process.env.AFIP_CERT` / `process.env.AFIP_KEY`) y
  la firma WSAA ocurre dentro de nuestro proceso; el SDK va directo a ARCA "sin
  intermediarios". Fuente: https://www.afipts.com/ (bloque quick-start y sección
  "WSAA automático: Vos solo pasás cert y key").

## 3. Licencia, costo, mantenimiento y adopción (`@arcasdk/core`)

- **Licencia:** MIT. Fuente: https://github.com/ralcorta/arcasdk (badge y archivo
  LICENSE) y https://www.afipts.com/ ("MIT · Sin costos").
- **Costo:** gratis (open source). Fuente: https://www.afipts.com/
- **Mantenimiento:** activo. 618 commits; último push 2026-07-10; refactor
  reciente a arquitectura hexagonal, CI con thresholds de cobertura, monorepo NX,
  releases 1.x. Fuente: https://github.com/ralcorta/arcasdk y GitHub API
  (`repos/ralcorta/arcasdk`: `pushed_at` 2026-07-10, licencia MIT, no archivado).
- **Adopción:** ~148 stars, 36 forks, 22 issues abiertos (GitHub API,
  2026-07-18). Descargas npm último mes: `@arcasdk/core` ~16.9k, `afip.ts` ~2.1k
  (registro npm, `api.npmjs.org/downloads/point/last-month`).

## 4. Comparación con alternativas

### 4.a `@afipsdk/afip.js` (afipsdk.com) — SDK hosteado

- **Modelo: cliente de una API hosteada, NO self-contained.** El código fuente
  crea un cliente axios con `baseURL: 'https://app.afipsdk.com/api/'` y envía
  **todas** las operaciones a los servidores de Afip SDK: `v1/afip/auth`,
  `v1/afip/certs` (creación de certificados), `v1/afip/ws-auths` (autorización
  WSAA), `v1/afip/requests` (llamadas a los web services) y `v1/automations`.
  Fuente: https://raw.githubusercontent.com/AfipSDK/afip.js/master/src/Afip.js y
  https://raw.githubusercontent.com/AfipSDK/afip.js/master/src/Class/AfipWebService.js
- **Dónde vive el certificado: en el tercero.** La integración Node pasa `cert` y
  `key` al constructor junto con un `access_token` obtenido de `app.afipsdk.com`;
  como la autorización WSAA se resuelve del lado servidor (`v1/afip/ws-auths`), la
  clave privada se transmite a la infraestructura de Afip SDK. **Esto viola
  nuestro requisito de privacidad.** Fuente:
  https://docs.afipsdk.com/integracion/node.js
- **Requiere `access_token` obligatorio** de https://app.afipsdk.com — hay una
  dependencia de red y de cuenta con el proveedor en el camino crítico. Fuente:
  https://docs.afipsdk.com/integracion/node.js
- **Costo:** el paquete npm es MIT, pero el **servicio es freemium de pago**.
  Plan Free (limitado), Pro $25 USD/mes, y planes de $80 y $250 USD/mes, con
  cargos por CUIT y por requests extra. Fuente: https://afipsdk.com/pricing/
- **Licencia (código cliente):** MIT. **Mantenimiento:** activo (185 commits,
  último push 2026-06-25). **Adopción:** ~194 stars, 93 forks, 0 issues abiertos
  (GitHub API); descargas npm último mes de `@afipsdk/afip.js` ~39k — mayor
  adopción que arcasdk, pero a costa del modelo hosteado. Fuentes:
  https://github.com/AfipSDK/afip.js y GitHub API / npm registry.

### 4.b `afip.ts`

- Es el nombre anterior del mismo proyecto de `ralcorta`, hoy `@arcasdk/core`.
  Sigue publicado en npm por compatibilidad pero el desarrollo activo está en
  `@arcasdk/core`. Fuente: https://github.com/ralcorta/arcasdk

### 4.c Integración directa contra los WS de ARCA

- **Modelo:** self-contained total. Implementamos WSAA (login con CMS firmado y
  cache del Ticket de Acceso) y WSFEv1 (SOAP) contra los endpoints oficiales de
  ARCA; el certificado y la clave nunca salen de nuestra infra. Documentación
  oficial: los manuales de WSAA y WSFEv1 en https://www.afip.gob.ar/ws/
- **Costo/licencia:** sin dependencias de terceros ni costos de licencia.
- **Contra:** mayor esfuerzo de implementación y mantenimiento (manejo de SOAP,
  firma CMS, parseo de WSDL, tablas de parámetros, manejo de errores de ARCA), que
  es justamente lo que `@arcasdk/core` ya encapsula con tipos.

### Tabla comparativa

| Criterio                                 | `@arcasdk/core` (afipts.com)              | `@afipsdk/afip.js` (afipsdk.com)          | Integración directa a ARCA        |
| ---------------------------------------- | ----------------------------------------- | ----------------------------------------- | --------------------------------- |
| Qué es                                   | Librería open source self-contained       | Cliente de API hosteada de un tercero     | Código propio contra WS oficiales |
| Node/TypeScript nativo                   | Sí, tipos completos, serverless-ready     | Sí (JS con typings)                       | Nosotros lo escribimos            |
| ¿La clave privada sale de nuestra infra? | **No** (firma WSAA local, directo a ARCA) | **Sí** (va a `app.afipsdk.com`)           | **No**                            |
| WSAA / manejo de TA                      | Automático, cache configurable            | Resuelto en servidores del tercero        | A implementar por nosotros        |
| WSFEv1 / CAE                             | Sí                                        | Sí                                        | A implementar                     |
| Factura C monotributo                    | Sí (`CbteTipo 11`)                        | Sí                                        | Sí (nosotros)                     |
| Homologación/testing                     | Guías + soporte de certs de testing       | Sí (modo dev con CUIT compartido)         | Sí                                |
| PDF                                      | Sí (`@arcasdk/pdf`)                       | Vía servicio                              | Aparte                            |
| Licencia                                 | MIT                                       | Cliente MIT; servicio propietario de pago | N/A                               |
| Costo                                    | Gratis                                    | Free limitado; $25–$250+ USD/mes          | Sin costo de licencia             |
| Dependencia de red a un tercero          | No                                        | **Sí** (crítica para facturar)            | No                                |
| Mantenimiento                            | Activo (push 2026-07-10, 618 commits)     | Activo (push 2026-06-25, 185 commits)     | Nuestro                           |
| Adopción (stars / npm/mes)               | ~148 / ~16.9k                             | ~194 / ~39k                               | N/A                               |
| Esfuerzo de implementación               | Bajo                                      | Bajo                                      | Alto                              |

Fuentes de la tabla: https://www.afipts.com/,
https://www.afipts.com/services/facturacion_electronica.html,
https://github.com/ralcorta/arcasdk, https://docs.afipsdk.com/integracion/node.js,
https://raw.githubusercontent.com/AfipSDK/afip.js/master/src/Afip.js,
https://afipsdk.com/pricing/, https://github.com/AfipSDK/afip.js, GitHub API y npm
registry (consultados 2026-07-18).

## 5. Recomendación y tradeoffs

1. **Elegir `@arcasdk/core` (self-contained, MIT).** Cumple el requisito duro de
   privacidad (clave privada dentro de nuestra infra, directo a ARCA), es Node/TS
   nativo, cubre WSFEv1 + WSAA + Factura C + homologación, y ahorra el grueso del
   trabajo de SOAP/firma. Tradeoff: dependemos de un proyecto mantenido
   mayormente por una persona; mitigable porque es MIT y podemos forkear o caer a
   integración directa si el mantenimiento se detiene.
2. **Fallback: integración directa contra los WS de ARCA.** Misma garantía de
   privacidad y cero dependencia de terceros, a cambio de más esfuerzo. Es el plan
   B natural si `@arcasdk/core` no encaja (bug bloqueante, feature faltante).
3. **Descartar `@afipsdk/afip.js` para nuestro caso.** Aunque tiene más adopción y
   buena DX, su modelo hosteado envía certificado/clave y todas las operaciones a
   `app.afipsdk.com`, lo que rompe el requisito de privacidad e introduce un
   tercero de pago en el camino crítico de facturación. Solo reconsiderar si el
   requisito de "la clave no sale de la infra" se relajara explícitamente.

**Próximo paso sugerido:** hacer un spike de homologación con `@arcasdk/core`
(obtener certificado de testing, emitir una Factura C con CAE contra el entorno de
homologación de ARCA) para validar cobertura real y ergonomía antes de
comprometer la decisión.
