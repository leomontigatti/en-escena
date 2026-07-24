# DNS y correo

Runbook para mover la zona `enescena.com.ar` de DreamHost a Cloudflare, dejar el
correo entrante como reenvío a Gmail y mandar el correo saliente por Resend con
remitente propio.

Cierra la dependencia operativa de #490 (remitente propio) y desbloquea la
Opción A de #238 (WAF y rate limiting delante de la app).

## Estado de partida

Verificado contra `ns1.dreamhost.com` el 2026-07-24.

| Pieza                             | Dónde vive                                                    |
| --------------------------------- | ------------------------------------------------------------- |
| Zona DNS                          | DreamHost (`ns1/2/3.dreamhost.com`)                           |
| Landing `enescena.com.ar` + `www` | `75.119.201.215` (shared de DreamHost, WordPress)             |
| App `sistema.enescena.com.ar`     | `72.60.59.2` (VPS Hostinger, Coolify)                         |
| Registrante                       | NIC.ar, bajo un CUIT al que tenemos acceso                    |
| Correo                            | configurado en DreamHost (MailChannels) pero **sin uso real** |

La zona actual, reconstruida por sondeo dirigido (la transferencia de zona está
cerrada, así que no es necesariamente exhaustiva):

| Nombre                 | Tipo  | Valor                                                                           |
| ---------------------- | ----- | ------------------------------------------------------------------------------- |
| `@`                    | A     | `75.119.201.215`                                                                |
| `@`                    | MX    | `0 mx1.mailchannels.net` / `0 mx2.mailchannels.net`                             |
| `@`                    | TXT   | `v=spf1 mx include:netblocks.dreamhost.com include:relay.mailchannels.net -all` |
| `www`                  | A     | `75.119.201.215`                                                                |
| `sistema`              | A     | `72.60.59.2`                                                                    |
| `mail`                 | A     | `64.90.62.162`                                                                  |
| `mail`                 | MX    | `0 mx1/mx2.mailchannels.net`                                                    |
| `webmail`              | A     | `69.163.136.138`                                                                |
| `mailboxes`            | A     | `69.163.136.97`                                                                 |
| `ftp`                  | A     | `75.119.201.215`                                                                |
| `ssh`                  | A     | `75.119.201.215`                                                                |
| `mysql`                | A     | `64.90.32.51`                                                                   |
| `www.mailboxes`        | A     | `69.163.136.97`                                                                 |
| `www.webmail`          | A     | `69.163.136.138`                                                                |
| `autoconfig`           | CNAME | `autoconfig.dreamhost.com`                                                      |
| `_autodiscover._tcp`   | SRV   | `5 0 443 autoconfig.dreamhost.com`                                              |
| `dreamhost._domainkey` | TXT   | `v=DKIM1; k=rsa; ...`                                                           |

No hay `AAAA`, ni `CAA`, ni `_dmarc`.

Las últimas cuatro filas de A aparecieron en el escaneo automático de Cloudflare
y no en el sondeo manual, que no probaba esos nombres. Conviene tomar el escaneo
como fuente y revisarlo entero antes de borrar nada.

Nota para #490: el issue afirma que no hay DKIM porque sondeó el selector
`mail._domainkey`. Sí lo hay, bajo `dreamhost._domainkey`. No cambia el plan
—Resend firma con su propio selector `resend._domainkey`— pero el dato del issue
está mal.

## Zona objetivo en Cloudflare

Como el correo de DreamHost no se usa, no se replica: los registros `mail`,
`webmail`, `mailboxes`, `autoconfig`, `_autodiscover._tcp`, `dreamhost._domainkey`,
los MX de MailChannels y el SPF viejo se descartan.

| Nombre              | Tipo | Valor                                                | Proxy    |
| ------------------- | ---- | ---------------------------------------------------- | -------- |
| `@`                 | A    | `75.119.201.215`                                     | DNS only |
| `www`               | A    | `75.119.201.215`                                     | DNS only |
| `ftp`               | A    | `75.119.201.215`                                     | DNS only |
| `ssh`               | A    | `75.119.201.215`                                     | DNS only |
| `mysql`             | A    | `64.90.32.51`                                        | DNS only |
| `sistema`           | A    | `72.60.59.2`                                         | Proxied  |
| `@`                 | MX   | los 3 que agrega Email Routing                       | —        |
| `@`                 | TXT  | `v=spf1 include:_spf.mx.cloudflare.net ~all`         | —        |
| `send`              | MX   | `feedback-smtp.<region>.amazonses.com` (prio 10)     | DNS only |
| `send`              | TXT  | `v=spf1 include:amazonses.com ~all`                  | —        |
| `resend._domainkey` | TXT  | clave pública que da Resend                          | —        |
| `_dmarc`            | TXT  | `v=DMARC1; p=none; rua=mailto:dmarc@enescena.com.ar` | —        |

`ftp`, `ssh` y `mysql` sólo hacen falta mientras la landing siga en DreamHost, y
los tres tienen que quedar en **DNS only**: el proxy de Cloudflare sólo transporta
HTTP y HTTPS. `mysql` es el caso delicado, porque es el hostname que DreamHost
asigna para la base y el que suele llevar el `DB_HOST` del `wp-config.php`. Si
queda proxeado, resuelve a una IP de Cloudflare y el WordPress pierde la conexión
a su base en cuanto propaga la delegación.

Sólo puede haber **un** registro SPF en el ápex. El de Email Routing reemplaza al
de DreamHost; tener los dos da `permerror` y rompe la validación entera.

El SPF del ápex no interviene en los envíos de Resend: el Return-Path queda en
`send.enescena.com.ar`, así que SPF se evalúa contra el TXT de ese subdominio. Y
para DMARC alinean las dos vías —DKIM firma con `d=enescena.com.ar`, y SPF alinea
en modo relaxed por ser subdominio del mismo dominio organizacional—, lo que deja
margen para endurecer la política más adelante.

## 1. NIC.ar

Recién **después** de tener la zona cargada y verificada en Cloudflare (paso 2).

1. Entrar a `nic.ar` con la Clave Fiscal del CUIT registrante.
2. Mis dominios → `enescena.com.ar` → Cambiar delegación / DNS.
3. Reemplazar `ns1/ns2/ns3.dreamhost.com` por los dos nameservers que asignó
   Cloudflare (`<algo>.ns.cloudflare.com`).
4. Guardar y esperar la propagación (típicamente minutos, hasta 24 h en el peor
   caso).

Mientras ambos juegos de nameservers respondan lo mismo no hay ventana de
downtime: el riesgo es de omisión de registros, no de timing. De ahí que la zona
se cargue completa antes de tocar la delegación.

## 2. Cloudflare

### 2.1 Crear la zona

1. Add a site → `enescena.com.ar` → plan Free.
2. Cloudflare escanea y preimporta los registros que encuentra, **todos como
   Proxied**. Revisar contra la tabla objetivo y borrar los de correo de
   DreamHost.
3. **Agregar `sistema` a mano.** El escaneo prueba nombres comunes y no lo
   detecta; si falta, la app queda inaccesible al propagar la delegación.
4. Pasar a **DNS only** todo: los servicios no-HTTP porque el proxy los rompe
   (ver arriba), y `@`, `www` y `sistema` para no mezclar el cambio de
   delegación con el de proxy. El proxy de `sistema` se activa en el paso 2.4,
   una vez confirmado que la delegación no rompió nada.
5. Borrar los MX de MailChannels del ápex antes de activar. Si sobreviven al
   momento en que Email Routing agrega los suyos, el entrante se reparte entre
   los dos destinos.
6. Anotar los nameservers asignados y ejecutar el paso 1 (NIC.ar).

Email Routing (2.2) sólo se puede terminar de configurar con la zona ya activa,
o sea después de NIC.ar. El orden real es: limpiar la zona → activar → NIC.ar →
Email Routing.

Verificar antes de seguir:

```sh
dig +short NS enescena.com.ar
dig +short A sistema.enescena.com.ar
curl -sSI https://sistema.enescena.com.ar | head -3
```

### 2.2 Correo entrante: Email Routing

Email Routing recibe en `@enescena.com.ar` y reenvía a una casilla existente. No
requiere buzones ni servidor de correo, y es gratis.

1. Email → Email Routing → Get started.
2. Destination addresses → agregar la casilla de Gmail en uso. Cloudflare le
   manda un mail de verificación; hay que abrirlo y confirmar.
3. Aceptar que Cloudflare agregue los MX y el SPF automáticamente. Eso reemplaza
   los MX de MailChannels y el SPF de DreamHost.
4. Rutas:
   - `acceso@enescena.com.ar` → forward a la casilla de Gmail;
   - `dmarc@enescena.com.ar` → forward a la misma casilla, para los reportes;
   - catch-all → forward a la misma casilla (o `drop` si se prefiere silencio).

Email Routing **sólo reenvía, no envía**. Eso alcanza porque el saliente lo hace
Resend. Si además se quiere responder _desde_ `acceso@enescena.com.ar` con la
interfaz de Gmail, se configura "Enviar como" apuntando al SMTP de Resend:

```txt
Host: smtp.resend.com
Port: 587 (STARTTLS)
Username: resend
Password: <RESEND_API_KEY>
```

### 2.3 Correo saliente: Resend

1. Resend → Domains → Add Domain → `enescena.com.ar`, eligiendo región.
2. Cargar en Cloudflare los tres registros que devuelve: el MX y el TXT de
   `send`, y el TXT de `resend._domainkey`. Los tres van **DNS only** (los TXT y
   MX nunca se proxean, pero conviene verificarlo en el MX).
3. Esperar el `verified` en el panel de Resend.
4. Agregar el DMARC en `p=none` para tener reportes antes de endurecer.

El `rua` tiene que apuntar a una dirección del propio dominio. Un `rua` hacia un
dominio ajeno —una casilla de Gmail, por ejemplo— exige que ese dominio publique
una autorización cruzada (`enescena.com.ar._report._dmarc.gmail.com`), que sólo
podría crear Google; sin ella buena parte de los proveedores no manda los
reportes. Con `dmarc@enescena.com.ar` reenviado por Email Routing llegan igual a
Gmail y no hay validación externa que resolver.

Los reportes son XML comprimido y llegan varios por día. Para leerlos sin
herramientas hay servicios gratuitos de digest (Postmark, dmarcian) que dan una
dirección para el `rua` y mandan un resumen legible.

### 2.4 Proxy y WAF sobre `sistema`

Recién con lo anterior estable:

1. Cambiar `sistema` a **Proxied**.
2. SSL/TLS → modo **Full (strict)**: Traefik ya sirve un certificado válido de
   Let's Encrypt.
3. Cargar las reglas WAF y de rate limiting descritas en #238, acotadas con
   `http.host eq "sistema.enescena.com.ar"`.

Dos consideraciones propias de esta app:

- **Tamaño de request.** Los uploads de música admiten hasta 50 MB
  (`choreographyMusicMaxFileSizeBytes`) y viajan como `multipart/form-data` por
  la app, no directo a un storage externo. El límite de body en los planes Free y
  Pro de Cloudflare es 100 MB, así que entra — pero el margen es de 2x. Subir el
  límite de música por encima de ~90 MB requiere revisar esto primero.
- **Servir bytes por el proxy.** El storage vive en un volumen local del VPS y se
  sirve por la ruta `/almacenamiento` de la app. Los términos self-serve de
  Cloudflare desaconsejan usar el CDN para servir volúmenes desproporcionados de
  contenido no-HTML (audio y video). Con el volumen actual no debería ser un
  problema, pero si alguna vez aparece un reclamo, la salida es exponer el
  storage por un hostname aparte en DNS only.

## 3. Hostinger

El firewall de la VPS ya quedó en default-deny con SSH restringido (#238). Con
Cloudflare delante, el paso siguiente **opcional** es aceptar 80/443 sólo desde
los rangos de Cloudflare (`https://www.cloudflare.com/ips-v4`), de modo que nadie
pueda saltear el WAF pegándole directo a `72.60.59.2`.

Antes de hacerlo:

- son ~15 rangos IPv4 y el firewall de Hostinger tiene un tope de reglas;
- si `sistema` volviera a DNS only por cualquier motivo, el sitio queda
  inaccesible hasta reabrir los puertos.

No es un prerrequisito de nada: sin esta restricción Cloudflare igual filtra todo
el tráfico que resuelve por DNS, que es la enorme mayoría.

## 4. Coolify

### Variables de entorno

En la app `en-escena` → Environment Variables:

- `EMAIL_FROM="En Escena <acceso@enescena.com.ar>"`
- `RESEND_API_KEY=re_...`
- eliminar `EMAIL_PROVIDER` y `BREVO_API_KEY`

`getEmailProvider()` defaultea a `resend`, así que borrar `EMAIL_PROVIDER` deja
el proveedor correcto sin más cambios. Requiere redeploy.

Conviene `acceso@` antes que `no-reply@`: con Email Routing las respuestas de
usuarios confundidos llegan a alguien, y los remitentes `no-reply` tienen peor
reputación en los filtros.

### Traefik detrás del proxy

Con Cloudflare proxeando `sistema`, la IP de origen que ve Traefik pasa a ser la
de Cloudflare. Eso invalida el middleware de rate limit propuesto en #238, que
agrupa por IP: todas las requests parecerían venir de un puñado de IPs y el
límite castigaría a todo el tráfico junto. Hay que agrupar por `CF-Connecting-IP`:

```yaml
http:
  middlewares:
    en-escena-ratelimit:
      rateLimit:
        average: 30
        period: 1s
        burst: 90
        sourceCriterion:
          requestHeaderName: CF-Connecting-IP
```

Ese header se lee sin validar su procedencia, así que sólo es confiable si nadie
puede pegarle directo al origen: es el argumento a favor de restringir 80/443 a
los rangos de Cloudflare (sección 3).

Conviene además declarar los rangos de Cloudflare en
`entryPoints.websecure.forwardedHeaders.trustedIPs` para que `X-Forwarded-For` y
`X-Forwarded-Proto` sean confiables.

## 5. Código

Casi nada:

- `.env.example` documenta el remitente y el proveedor por defecto.
- Ningún módulo lee la IP del cliente (`X-Forwarded-For`, `CF-Connecting-IP` ni
  equivalentes), así que el proxy no obliga a tocar código.
- No hay rate limiting en la app; vive en Traefik y Cloudflare.
- El cambio de Brevo a Resend no requiere cambios: `app/lib/shared/email.server.ts`
  ya soporta ambos y defaultea a Resend.

## Verificación

```sh
# Delegación
dig +short NS enescena.com.ar

# Saliente
dig +short TXT resend._domainkey.enescena.com.ar
dig +short TXT send.enescena.com.ar
dig +short MX send.enescena.com.ar

# Entrante
dig +short MX enescena.com.ar
dig +short TXT enescena.com.ar   # debe haber UN solo SPF

# Política
dig +short TXT _dmarc.enescena.com.ar
```

Después:

1. Disparar un "recuperar acceso" real contra una casilla de Gmail y confirmar en
   los detalles del mensaje que dice `signed-by: enescena.com.ar` y que DMARC pasa.
2. Mandar un mail _a_ `acceso@enescena.com.ar` y confirmar que llega al Gmail.
3. Confirmar que la landing y `sistema` siguen respondiendo.

## Rollback

Mientras la zona de DreamHost siga existiendo, revertir la delegación en NIC.ar a
`ns1/2/3.dreamhost.com` restaura el estado anterior en cuanto propaga. Conviene no
borrar la zona en DreamHost hasta haber corrido la verificación completa.
