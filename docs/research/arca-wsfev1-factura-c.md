# Emisión de Factura C (monotributista) por Web Service de ARCA — WSAA + WSFEv1

> Research de referencia para el mapa wayfinder de facturación electrónica (issue #321).
> Todas las afirmaciones citan documentación **oficial** de ARCA/AFIP. Los manuales de
> ARCA usan indistintamente los dominios `afip.gob.ar` (portal) y `afip.gov.ar` (endpoints
> SOAP); ambos son oficiales y aparecen tal cual en la documentación citada.

## Fuentes oficiales

- **WSAA — Manual del Desarrollador** (Pub. 20.2.19):
  https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf
- **WSAA — Especificación Técnica** (1.2.2):
  https://www.afip.gob.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf
- **WSFEv1 — Manual para el desarrollador V. 4.5** (RG 4291 / adecuación RG 5616):
  https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
  (espejo de homologación externa: https://www.afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf)
- **WSAA — Documentación / URLs y certificados**: https://www.afip.gob.ar/ws/documentacion/wsaa.asp
- **Arquitectura general de Web Services**: https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp
- **Certificados (testing y producción)**: https://www.afip.gob.ar/ws/documentacion/certificados.asp
- **WS de Factura Electrónica (índice de manuales)**: https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp
- **Homologación externa (RG 5616/2024)**: https://www.afip.gob.ar/ws/documentacion/homologacion-externa.asp

---

## 0. Panorama del flujo end-to-end

Para autorizar una Factura C hay que encadenar **dos** web services SOAP sobre HTTPS
([Arquitectura general](https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp)):

1. **WSAA** (Web Service de Autenticación y Autorización) → devuelve un **Ticket de Acceso
   (TA)** con dos componentes: **Token** y **Sign**, válido para *un* web service de negocio
   (WSN) puntual y con vigencia limitada (actualmente **12 horas**).
2. **WSFEv1** (Web Service de Factura Electrónica V1, `wsfe`/`wsfev1`) → recibe Token+Sign+CUIT
   en cada request y autoriza el comprobante devolviendo el **CAE**.

El manual de arquitectura lo resume: el cliente firma un CMS (PKCS#7 / S/MIME) con su
certificado X.509, el WSAA valida firma + autorización y devuelve el TA; el cliente extrae
Token y Sign y los envía "junto con los datos de negocio en cada solicitud que le envíe al
WSN"
([Arquitectura general](https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp)).

---

## 1. WSAA — Autenticación

### 1.1 LoginTicketRequest (TRA)

Es el XML que el cliente arma y firma. Estructura oficial del ejemplo del manual
([WSAA Manual §5.1](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)):

```xml
<loginTicketRequest>
  <header>
    <uniqueId>190926</uniqueId>
    <generationTime>2019-09-26T10:09:20</generationTime>
    <expirationTime>2019-09-26T10:29:20</expirationTime>
  </header>
  <service>ws_sr_constancia_inscripcion</service>
</loginTicketRequest>
```

Reglas de los campos (WSAA Manual, capítulos 5, 7 y 10):

- **`service`**: ID del WSN al que se quiere acceder. **Para facturación electrónica el
  service es `wsfe`** (así aparece en el TA de ejemplo del manual: "El servicio a acceder:
  'wsfe'") ([WSAA Manual §6.3](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).
- **`uniqueId`**: identificador del request. El ejemplo PowerShell del manual lo genera como
  `yyMMddHHMM`.
- **`generationTime` / `expirationTime`**: rango de validez del TRA. En el ejemplo PowerShell:
  `generationTime = ahora - 10 min`, `expirationTime = ahora + 10 min`, formato ISO-8601 `s`.
- **Zona horaria**: el equipo debe estar sincronizado (NTP contra `time.afip.gov.ar`) y en
  **GMT-3**; de lo contrario aparece el error "El tiempo de expiración es inferior a la hora
  actual" ([WSAA Manual §10.7](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).
- `generationTime` no puede estar en el futuro ni tener **más de 24 horas** de antigüedad
  ([WSAA Manual §10.9](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).

### 1.2 Firma CMS con el certificado

El TRA se firma generando un mensaje **CMS (PKCS#7 / S/MIME)** con el certificado X.509 y su
clave privada. Ejemplo con OpenSSL del manual
([WSAA Manual §5.2](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)):

```
openssl cms -sign -in MiLoginTicketRequest.xml \
  -out MiLoginTicketRequest.xml.cms -signer MiCertificado.pem -outform PEM -nodetach
```

El texto entre `-----BEGIN CMS-----` y `-----END CMS-----` (base64) es lo que se envía al
método `loginCms` en el parámetro **`in0`**
([WSAA Manual §5.2 y §6.2](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).

Errores de firma (`cms.sign.invalid`, `cms.bad`, `cms.bad.base64`) suelen deberse a
certificado inválido/expirado, parámetros mal pasados, o **mezclar ambiente** (certificado de
producción contra servidor de homologación o viceversa)
([WSAA Manual §10.8](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).

### 1.3 Método `loginCms` y respuesta (Token + Sign)

`loginCms` tiene un único parámetro (`in0` = el CMS firmado). Devuelve un
`loginTicketResponse` con `<token>`, `<sign>` y un `<header>` con `generationTime`,
`expirationTime` y `uniqueId` ([WSAA Manual §6.2](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)):

```xml
<loginTicketResponse>
  <header>
    <expirationTime>2019-09-27T01:56:14.467-03:00</expirationTime>
    ...
  </header>
  <credentials>
    <token>PD94bWwgdmVyc2lv . . . go8L3Nzbz4K</token>
    <sign>Urp5dbarIb8m5y . . . SEzSeon1W7ys=</sign>
  </credentials>
</loginTicketResponse>
```

### 1.4 Vigencia y caching del TA (CRÍTICO para la integración)

- El TA "tiene una validez limitada en el tiempo (actualmente, 12 horas)"
  ([Arquitectura general](https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp)).
- **Hay que cachear el TA y reutilizarlo hasta que expire.** El manual advierte que si se piden
  varios TA para el mismo servicio en un lapso corto, el WSAA rechaza con **"El CEE ya posee un
  TA valido para el acceso al WSN solicitado"**. El lapso preventivo actual es **10 minutos en
  testing y 2 minutos en producción** (valores modificables sin aviso). La recomendación
  explícita: pedir un TA y usar el WSN múltiples veces mientras el TA siga vigente (~12 h);
  recién cuando expira, pedir uno nuevo. La vigencia se conoce por el campo `expirationTime` del
  TA ([WSAA Manual §10.6](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).
- **Implicancia de diseño:** persistir Token+Sign+`expirationTime` (p.ej. por CUIT+service) y
  renovar sólo al vencer, con un pequeño margen. No pedir un TA por comprobante.

### 1.5 URLs del WSAA

- **Testing / Homologación**: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`
  (WSDL: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl`)
- **Producción**: `https://wsaa.afip.gov.ar/ws/services/LoginCms`

Fuente: [WSAA — Documentación (sección URLs)](https://www.afip.gob.ar/ws/documentacion/wsaa.asp).

---

## 2. WSFEv1 — Facturación

**Namespace SOAP**: `http://ar.gov.afip.dif.FEV1/`. Todo request lleva un bloque `<Auth>` con
`<Token>`, `<Sign>` y `<Cuit>` (CUIT del emisor/representado)
([WSFEv1 Manual](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).

### 2.1 URLs / WSDL

| Ambiente     | Endpoint                                            | WSDL                                                     |
| ------------ | --------------------------------------------------- | -------------------------------------------------------- |
| Homologación | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`   | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL`   |
| Producción   | `https://servicios1.afip.gov.ar/wsfev1/service.asmx`| `https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL`|

Fuente: [WSFEv1 Manual, sección "Direcciones URL"](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf).

### 2.2 Métodos relevantes

| Método | Para qué sirve |
| --- | --- |
| `FEDummy` | Verifica infraestructura. Devuelve `AppServer`, `DbServer`, `AuthServer` (esperado `OK`). No requiere auth de negocio. |
| `FECompUltimoAutorizado` | Último comprobante autorizado para un `PtoVta` + `CbteTipo`. Base para calcular el correlativo siguiente. |
| `FECAESolicitar` | **Autoriza el comprobante y devuelve el CAE.** |
| `FECompConsultar` | Consulta un comprobante ya emitido y su CAE. |
| `FEParamGetTiposCbte` | Tipos de comprobante válidos (incluye Factura C = 11). |
| `FEParamGetTiposConcepto` | Conceptos posibles (1 Productos, 2 Servicios, 3 Productos y Servicios). |
| `FEParamGetTiposDoc` | Tipos de documento del receptor (80 CUIT, 96 DNI, 99 Consumidor Final, etc.). |
| `FEParamGetTiposIva` | Alícuotas de IVA (no se usan en Factura C). |
| `FEParamGetTiposMonedas` | Monedas (`PES` = pesos, cotización 1). |
| `FEParamGetPtosVenta` | Puntos de venta habilitados para el CUIT en WS. |
| `FEParamGetCondicionIvaReceptor` | **Códigos de condición frente al IVA del receptor (RG 5616).** |
| `FEParamGetCotizacion` | Cotización de una moneda. |
| `FEParamGetActividades` | Actividades vigentes del emisor. |

Todas se invocan bajo `.../wsfev1/service.asmx?op=<Método>`
([WSFEv1 Manual, índice de métodos](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).

### 2.3 Recomendación operativa antes de emitir

1. `FEDummy` (opcional, health-check).
2. `FEParamGetPtosVenta` para conocer los puntos de venta de factura electrónica habilitados.
3. `FECompUltimoAutorizado(PtoVta, CbteTipo=11)` → devuelve `CbteNro`; el próximo comprobante
   es `CbteNro + 1` (ver validación 10016 más abajo).
4. `FEParamGetCondicionIvaReceptor(ClaseCmp="C")` para mapear la condición IVA del receptor.
5. `FECAESolicitar` con el detalle del comprobante.

---

## 3. Factura C — campos requeridos en `FECAESolicitar`

**Factura C = `CbteTipo` 11.** Los comprobantes "tipo C" del WS son **11 (Factura C), 12 (Nota
de Débito C), 13 (Nota de Crédito C) y 15 (Recibo C)** — se citan como grupo `(11,12,13,15)` en
la validación 10061 del manual
([WSFEv1 Manual, validación 10061](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).
La Factura C es la que emite el **Monotributista** (y el Responsable Exento): son comprobantes
**sin IVA discriminado**.

### 3.1 Estructura del request (`FeCAEReq`)

```
FECAESolicitar
└─ Auth { Token, Sign, Cuit }
└─ FeCAEReq
   ├─ FeCabReq { CantReg, PtoVta, CbteTipo }
   └─ FeDetReq
      └─ FECAEDetRequest { Concepto, DocTipo, DocNro, CbteDesde, CbteHasta, CbteFch,
                           ImpTotal, ImpTotConc, ImpNeto, ImpOpEx, ImpTrib, ImpIVA,
                           [FchServDesde, FchServHasta, FchVtoPago], MonId, MonCotiz,
                           CondicionIVAReceptorId, [CbtesAsoc], [Tributos], [Iva],
                           [Opcionales], [Compradores], [PeriodoAsoc], [Actividades] }
```

Fuente completa del XML y de las tablas de campos:
[WSFEv1 Manual, "Método de autorización … (FECAESolicitar)"](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf).

### 3.2 Cabecera `FeCabReq`

| Campo | Tipo | Obl. | Nota |
| --- | --- | --- | --- |
| `CantReg` | Int(4) | S | Cantidad de comprobantes del lote (1 si es individual). |
| `CbteTipo` | Int(3) | S | **11** para Factura C. Todos los del lote deben ser del mismo tipo. |
| `PtoVta` | Int(5) | S | Punto de venta. Todos los del lote, el mismo. |

### 3.3 Detalle `FECAEDetRequest` — reglas específicas de Factura C (tipo C)

| Campo | Tipo | Obl. | Regla para Factura C |
| --- | --- | --- | --- |
| `Concepto` | Int(2) | S | 1 Productos, 2 Servicios, 3 Productos y Servicios. |
| `DocTipo` | Int(2) | S | Documento del comprador (80 CUIT, 96 DNI, 99 Consumidor Final/sin identificar…). Consultar `FEParamGetTiposDoc`. |
| `DocNro` | Long(11) | S | Nro. de documento del comprador. |
| `CbteDesde` / `CbteHasta` | Long(8) | S | Rango 1–99999999. **Para tipo C `CbteHasta` debe ser igual a `CbteDesde`** (validación 10012). |
| `CbteFch` | String(8) | N | `yyyymmdd`. Concepto 1: ±5 días de la generación; Concepto 2/3: ±10 días. Si no se envía se asigna la fecha de proceso. |
| `ImpTotal` | Double(13+2) | S | = ImpTotConc + ImpOpEx + ImpNeto + IVA + ImpTrib. **En Factura C = ImpNeto + ImpTrib** (los demás son 0). |
| `ImpTotConc` | Double(13+2) | S | Importe neto no gravado. **Para tipo C debe ser 0.** |
| `ImpNeto` | Double(13+2) | S | **Para tipo C es el importe del SUBTOTAL** (no "neto gravado"). |
| `ImpOpEx` | Double(13+2) | S | Importe exento. **Para tipo C debe ser 0.** |
| `ImpIVA` | Double(13+2) | S | **Para tipo C debe ser 0.** |
| `ImpTrib` | Double(13+2) | S | Suma de tributos (0 si no hay). |
| `FchServDesde` / `FchServHasta` / `FchVtoPago` | String(8) | condicional | **Obligatorios cuando `Concepto` = 2 o 3** (validación 10049). |
| `MonId` | String(3) | S | `PES` para pesos. Consultar `FEParamGetTiposMonedas`. |
| `MonCotiz` | Double(4+6) | N | Para `PES` = 1. |
| `CondicionIVAReceptorId` | Int(2) | *ver §3.5* | Condición frente al IVA del receptor (RG 5616). |
| `Iva` (array `AlicIva`) | Array | N | **Para tipo C NO debe informarse el array de IVA** (las validaciones 10018–10023 dicen "No aplica para comprobantes tipo C"). |

Fuente: tablas de campos y validaciones 10012, 10018–10023, 10049, 10061 del
[WSFEv1 Manual](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf).

> **Resumen mental para Factura C:** sin IVA discriminado → `ImpNeto` = subtotal,
> `ImpTotConc = ImpOpEx = ImpIVA = 0`, **no** enviar el array `<Iva>`, `ImpTotal = ImpNeto +
> ImpTrib`, y `CbteHasta = CbteDesde`.

### 3.4 Numeración correlativa

La validación **10016** exige que `CbteDesde` sea **mayor en 1** al último autorizado para el
mismo punto de venta y tipo de comprobante; ese último se obtiene con `FECompUltimoAutorizado`
([WSFEv1 Manual, validación 10016](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).
→ Emitir es: consultar último, sumar 1, autorizar. Conviene serializar la emisión por
(PtoVta, CbteTipo) para no generar huecos ni colisiones.

### 3.5 Condición frente al IVA del receptor (RG 5616) — `CondicionIVAReceptorId`

- El campo `CondicionIVAReceptorId` "resultará **obligatorio** conforme lo reglamentado por la
  **Resolución General N° 5616**". Si el valor informado no es válido: **para CAE rechaza**, para
  CAEA observa; si el valor no existe, rechaza en ambos casos
  ([WSFEv1 Manual, tabla FeDetReq](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).
  (En la tabla figura marcado "N" como columna de obligatoriedad estructural del XSD, pero el
  texto de la descripción lo vuelve obligatorio de negocio por RG 5616.)
- Los códigos válidos se obtienen con **`FEParamGetCondicionIvaReceptor`**, que acepta un
  parámetro opcional **`ClaseCmp`** (`A`, `ALEY`, `B`, `C`, `49`). Para Factura C conviene
  pasar `ClaseCmp="C"` y quedarse con las combinaciones permitidas para esa clase. Cada ítem
  devuelto trae `Id`, `Desc` y `Cmp_Clase`
  ([WSFEv1 Manual, "FEParamGetCondicionIvaReceptor"](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).
- **La lista canónica es la que devuelve el método** (fuente de verdad); debe cargarse en
  runtime y no hardcodearse. Valores de referencia habituales para clase C (verificar siempre
  contra la respuesta viva del método): 1 = IVA Responsable Inscripto, 4 = IVA Sujeto Exento,
  5 = Consumidor Final, 6 = Responsable Monotributo, 13 = Monotributista Social,
  16 = Monotributo Trabajador Independiente Promovido.

---

## 4. Respuesta de `FECAESolicitar` — CAE y qué persistir

La respuesta es `FECAESolicitarResult` con `FeCabResp`, `FeDetResp`, `Errors` y `Events`
([WSFEv1 Manual, "Estructura general del mensaje de Respuesta" y ejemplo](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).

### 4.1 `FeCabResp` (cabecera de respuesta)

| Campo | Tipo | Nota |
| --- | --- | --- |
| `Cuit` | Long(11) | CUIT del emisor. |
| `PtoVta` | Int(5) | Punto de venta. |
| `CbteTipo` | Int(3) | Tipo de comprobante. |
| `FchProceso` | String(14) | `yyyymmddhhmiss`. |
| `CantReg` | Int(4) | Cantidad de registros. |
| `Resultado` | String(1) | **A = Aprobado, R = Rechazado, P = Parcial.** |

### 4.2 `FeDetResp` (detalle de respuesta) — por comprobante

| Campo | Tipo | Nota |
| --- | --- | --- |
| `Concepto`, `DocTipo`, `DocNro`, `CbteDesde`, `CbteHasta`, `CbteFch` | — | Eco de lo enviado. |
| `Resultado` | String(1) | A / R / P a nivel comprobante. |
| **`CAE`** | String(14) | **Código de Autorización Electrónico.** |
| **`CAEFchVto`** | String(8) | **Fecha de vencimiento del CAE** (`yyyymmdd`). |
| `Observaciones` | Array de `Obs {Code Int(5), Msg String(255)}` | Observaciones que no impiden la autorización. |

Ejemplo oficial de respuesta aprobada
([WSFEv1 Manual, "Mensaje de Respuesta", ejemplo 1](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)):

```xml
<FeCabResp> ... <Resultado>A</Resultado> ... </FeCabResp>
<FeDetResp><FECAEDetResponse>
  <CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20100903</CbteFch>
  <Resultado>A</Resultado>
  <CAE>41124578989845</CAE>
  <CAEFchVto>20100913</CAEFchVto>
</FECAEDetResponse></FeDetResp>
```

### 4.3 `Errors` / `Events` / `Observaciones`

- **`Errors`** (`Err {Code, Msg}`): errores que impiden la autorización (rechazo).
- **`Observaciones`** por comprobante: el comprobante puede quedar aprobado *con* observaciones.
- **`Events`**: eventos informativos del WS.

Todos siguen el patrón `{Code Int, Msg String}`
([WSFEv1 Manual, estructuras Errors/Events/Observaciones](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).

### 4.4 Qué conviene persistir

Para trazabilidad legal y reimpresión, guardar como mínimo:

- **CAE** y **CAEFchVto** (obligatorio para el comprobante).
- `Resultado` (A/R/P) tanto de cabecera como de detalle.
- `PtoVta`, `CbteTipo` (11), `CbteDesde`/`CbteHasta` (número correlativo), `CbteFch`.
- `FchProceso` (timestamp del servidor de ARCA).
- Datos del receptor enviados: `DocTipo`, `DocNro`, `CondicionIVAReceptorId`.
- Importes: `ImpTotal`, `ImpNeto`, `ImpTrib` (y `ImpTotConc/ImpOpEx/ImpIVA` = 0).
- `Concepto` y, si aplica, `FchServDesde/Hasta`, `FchVtoPago`.
- `Observaciones` (Code+Msg) y `Errors`/`Events` de la respuesta, para auditar.
- Se recomienda persistir también el **payload SOAP enviado y la respuesta cruda** para
  reproceso/diagnóstico. El comprobante puede reverificarse luego con `FECompConsultar`.

> Nota: el manual observa que `Reproceso` es "campo no operativo para esta versión". La
> idempotencia real se logra consultando `FECompUltimoAutorizado`/`FECompConsultar` antes de
> reintentar, no confiando en `Reproceso`.

---

## 5. Homologación vs Producción

### 5.1 Endpoints por ambiente

| Servicio | Homologación (testing) | Producción |
| --- | --- | --- |
| WSAA `loginCms` | `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` | `https://wsaa.afip.gov.ar/ws/services/LoginCms` |
| WSFEv1 | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx` | `https://servicios1.afip.gov.ar/wsfev1/service.asmx` |

Fuentes: [WSAA — Documentación](https://www.afip.gob.ar/ws/documentacion/wsaa.asp) y
[WSFEv1 Manual](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf).
Un certificado de un ambiente **no** sirve en el otro (error `cms.sign.invalid`)
([WSAA Manual §10.8](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)).

### 5.2 Certificado de homologación (WSASS)

- El certificado digital X.509 para testing se gestiona con la aplicación web **WSASS**
  (Autoservicio de Acceso a APIs de Homologación), ingresando con **clave fiscal de una persona
  física** (no jurídica). Se adhiere al WSASS desde el **Administrador de Relaciones de Clave
  Fiscal**.
- En WSASS se **asocia el certificado al WSN** (para facturación, el servicio `wsfe`).
- Material oficial: [cómo adherirse al WSASS](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf),
  [manual WSASS (HTML)](https://www.afip.gob.ar/ws/WSASS/html/index.html),
  [manual WSASS (PDF)](https://www.afip.gob.ar/ws/WSASS/WSASS_manual.pdf), y las cadenas de
  certificación de homologación (ZIP) — todos en
  [Certificados](https://www.afip.gob.ar/ws/documentacion/certificados.asp) y
  [WSAA — Documentación](https://www.afip.gob.ar/ws/documentacion/wsaa.asp).

### 5.3 Certificado y alta de web service en producción

- El certificado de producción se genera con **"Administración de Certificados Digitales"** (o
  "Administrador de Certificados Digitales") accediendo con clave fiscal
  ([WSAA — Documentación](https://www.afip.gob.ar/ws/documentacion/wsaa.asp)).
- Guía oficial de generación: [WSAA.ObtenerCertificado.pdf](https://www.afip.gob.ar/ws/WSAA/WSAA.ObtenerCertificado.pdf)
  y [obtener certificado producción](https://www.afip.gob.ar/ws/WSAA/wsaa_obtener_certificado_produccion.pdf).
- La **autorización/relación del certificado con el WSN** (`wsfe`) en producción se hace con el
  **"Administrador de Relaciones de Clave Fiscal"** — guía
  [ADMINREL.DelegarWS.pdf](https://www.afip.gob.ar/ws/WSAA/ADMINREL.DelegarWS.pdf) y
  [asociar certificado a WSN](https://www.afip.gob.ar/ws/WSAA/wsaa_asociar_certificado_a_wsn_produccion.pdf).

### 5.4 Creación del punto de venta de factura electrónica

- El punto de venta para **Web Services** es distinto del de otras modalidades y se da de alta
  desde el servicio con clave fiscal **"Administración de puntos de venta y domicilios"** (o
  "ABM de puntos de venta"), asociándolo a la modalidad *Factura Electrónica – Web Services*.
- Los puntos de venta habilitados para el CUIT en el WS se consultan con
  **`FEParamGetPtosVenta`**
  ([WSFEv1 Manual, "FEParamGetPtosVenta"](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).
- Referencia general del régimen: [Régimen general de facturación](https://www.afip.gob.ar/facturacion/regimen-general/).

> El manual del desarrollador se centra en los métodos del WS; el alta operativa del punto de
> venta y la habilitación como emisor de comprobantes electrónicos son trámites con clave fiscal
> previos, verificados por la validación **10000** de `FECAESolicitar` (datos registrales,
> inscripción, autorización a emitir, domicilio fiscal)
> ([WSFEv1 Manual, validación 10000](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)).

---

## 6. Checklist accionable para la integración

1. **Certificado**: generar X.509 (homo vía WSASS, prod vía Administración de Certificados) y
   **asociarlo al servicio `wsfe`**.
2. **Punto de venta**: dar de alta un PtoVta modalidad *Factura Electrónica – Web Services* con
   clave fiscal; validarlo con `FEParamGetPtosVenta`.
3. **WSAA**: armar TRA (`service=wsfe`), firmar CMS, llamar `loginCms`, **cachear Token+Sign
   hasta `expirationTime` (~12 h)**; renovar sólo al vencer.
4. **Pre-emisión**: `FECompUltimoAutorizado(PtoVta, 11)` → `CbteNro+1`; cargar tablas con
   `FEParamGetCondicionIvaReceptor(ClaseCmp="C")`, `FEParamGetTiposDoc`, `FEParamGetTiposMonedas`.
5. **Emisión** `FECAESolicitar` (Factura C): `CbteTipo=11`, `CbteDesde=CbteHasta`,
   `ImpTotConc=ImpOpEx=ImpIVA=0`, `ImpNeto=subtotal`, sin array `<Iva>`, `MonId=PES`,
   `MonCotiz=1`, `CondicionIVAReceptorId` válido para clase C; si `Concepto` 2/3 → fechas de
   servicio y `FchVtoPago`.
6. **Persistir** CAE, CAEFchVto, Resultado, correlativo, importes, condición IVA receptor,
   observaciones y payloads.
7. **Manejo de errores**: distinguir `Resultado=R` + `Errors` (rechazo, no reintentar igual),
   de aprobado con `Observaciones`. Reconciliar reintentos con `FECompConsultar`.
8. **Ambientes**: no mezclar certificados/endpoints homo↔prod.
