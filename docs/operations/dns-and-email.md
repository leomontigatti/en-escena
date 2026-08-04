# DNS and email

Runbook for moving the `enescena.com.ar` zone from DreamHost to Cloudflare,
leaving inbound mail as forwarding to Gmail and sending outbound mail through
Resend from our own sender address.

Closes the operational dependency of #490 (own sender) and unblocks Option A of
#238 (WAF and rate limiting in front of the app).

## Starting state

Verified against `ns1.dreamhost.com` on 2026-07-24.

| Piece                             | Where it lives                                         |
| --------------------------------- | ------------------------------------------------------ |
| DNS zone                          | DreamHost (`ns1/2/3.dreamhost.com`)                    |
| Landing `enescena.com.ar` + `www` | `75.119.201.215` (DreamHost shared hosting, WordPress) |
| App `sistema.enescena.com.ar`     | `72.60.59.2` (Hostinger VPS, Coolify)                  |
| Registrant                        | NIC.ar, under a CUIT we have access to                 |
| Email                             | configured on DreamHost (MailChannels) but **unused**  |

The current zone, reconstructed by targeted probing (zone transfer is closed, so
this is not necessarily exhaustive):

| Name                   | Type  | Value                                                                           |
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

There is no `AAAA`, no `CAA` and no `_dmarc`.

The last four A rows showed up in Cloudflare's automatic scan and not in the
manual probe, which didn't test those names. Treat the scan as the source and
review it in full before deleting anything.

Note for #490: the issue claims there is no DKIM because it probed the
`mail._domainkey` selector. There is one, under `dreamhost._domainkey`. It
doesn't change the plan — Resend signs with its own `resend._domainkey`
selector — but the issue has it wrong.

## Target zone in Cloudflare

Since DreamHost's email isn't used, it isn't replicated: the `mail`, `webmail`,
`mailboxes`, `autoconfig`, `_autodiscover._tcp` and `dreamhost._domainkey`
records, the MailChannels MX records and the old SPF are all dropped.

| Name                | Type | Value                                                | Proxy    |
| ------------------- | ---- | ---------------------------------------------------- | -------- |
| `@`                 | A    | `75.119.201.215`                                     | DNS only |
| `www`               | A    | `75.119.201.215`                                     | DNS only |
| `ftp`               | A    | `75.119.201.215`                                     | DNS only |
| `ssh`               | A    | `75.119.201.215`                                     | DNS only |
| `mysql`             | A    | `64.90.32.51`                                        | DNS only |
| `sistema`           | A    | `72.60.59.2`                                         | Proxied  |
| `@`                 | MX   | the 3 that Email Routing adds                        | —        |
| `@`                 | TXT  | `v=spf1 include:_spf.mx.cloudflare.net ~all`         | —        |
| `send`              | MX   | `feedback-smtp.<region>.amazonses.com` (prio 10)     | DNS only |
| `send`              | TXT  | `v=spf1 include:amazonses.com ~all`                  | —        |
| `resend._domainkey` | TXT  | public key provided by Resend                        | —        |
| `_dmarc`            | TXT  | `v=DMARC1; p=none; rua=mailto:dmarc@enescena.com.ar` | —        |

`ftp`, `ssh` and `mysql` are only needed while the landing stays on DreamHost,
and all three have to remain **DNS only**: Cloudflare's proxy only carries HTTP
and HTTPS. `mysql` is the delicate one, because it is the hostname DreamHost
assigns to the database and the one that usually goes in `wp-config.php`'s
`DB_HOST`. If it ends up proxied it resolves to a Cloudflare IP and WordPress
loses the connection to its database as soon as the delegation propagates.

There can be only **one** SPF record at the apex. Email Routing's replaces
DreamHost's; having both yields `permerror` and breaks validation entirely.

The apex SPF plays no part in Resend's sends: the Return-Path stays on
`send.enescena.com.ar`, so SPF is evaluated against that subdomain's TXT. And
both paths align for DMARC — DKIM signs with `d=enescena.com.ar`, and SPF aligns
in relaxed mode by being a subdomain of the same organizational domain — which
leaves room to harden the policy later.

## 1. NIC.ar

Only **after** the zone is loaded and verified in Cloudflare (step 2).

1. Log in to `nic.ar` with the registrant CUIT's Clave Fiscal.
2. Mis dominios → `enescena.com.ar` → Cambiar delegación / DNS.
3. Replace `ns1/ns2/ns3.dreamhost.com` with the two nameservers Cloudflare
   assigned (`<something>.ns.cloudflare.com`).
4. Save and wait for propagation (typically minutes, up to 24 h worst case).

As long as both sets of nameservers answer the same thing there is no downtime
window: the risk is omitting records, not timing. Hence loading the zone in full
before touching the delegation.

## 2. Cloudflare

### 2.1 Create the zone

1. Add a site → `enescena.com.ar` → Free plan.
2. Cloudflare scans and pre-imports the records it finds, **all as Proxied**.
   Check them against the target table and delete DreamHost's email records.
3. **Add `sistema` by hand.** The scan tries common names and doesn't detect it;
   if it's missing, the app becomes unreachable once the delegation propagates.
4. Switch everything to **DNS only**: the non-HTTP services because the proxy
   breaks them (see above), and `@`, `www` and `sistema` so the delegation change
   isn't mixed with the proxy change. The proxy on `sistema` is enabled in step
   2.4, once the delegation is confirmed not to have broken anything.
5. Delete the MailChannels MX records from the apex before activating. If they
   survive until Email Routing adds its own, inbound mail is split between the
   two destinations.
6. Note the assigned nameservers and run step 1 (NIC.ar).

Email Routing (2.2) can only be configured once the zone is active, i.e. after
NIC.ar and after the delegation propagates. That includes its "Add missing
records" button: it won't write the records either while the zone is pending.
The real order is: clean up the zone → activate → NIC.ar → wait for propagation
→ Email Routing.

Propagation of a `.com.ar` is not immediate: NIC.ar applies delegation changes in
batches, and the TLD's NS records are published with TTL 7200. To see the real
state without resolver caching, query the TLD directly:

```sh
dig @c.dns.ar +norecurse +noall +authority enescena.com.ar NS
```

Verify before moving on:

```sh
dig +short NS enescena.com.ar
dig +short A sistema.enescena.com.ar
curl -sSI https://sistema.enescena.com.ar | head -3
```

### 2.2 Inbound email: Email Routing

Email Routing receives at `@enescena.com.ar` and forwards to an existing mailbox.
It requires no mailboxes and no mail server, and it's free.

1. Email → Email Routing → Get started.
2. Destination addresses → add the Gmail mailbox in use. Cloudflare sends it a
   verification email; it has to be opened and confirmed.
3. Accept Cloudflare adding the MX and SPF records automatically. That replaces
   the MailChannels MX records and DreamHost's SPF.
4. Routes:
   - `acceso@enescena.com.ar` → forward to the Gmail mailbox;
   - `dmarc@enescena.com.ar` → forward to the same mailbox, for the reports;
   - catch-all → forward to the same mailbox (or `drop` if silence is preferred).

Email Routing **only forwards, it does not send**. That's enough because Resend
handles outbound. If you also want to reply _from_ `acceso@enescena.com.ar` in
Gmail's interface, configure "Send mail as" pointing at Resend's SMTP:

```txt
Host: smtp.resend.com
Port: 587 (STARTTLS)
Username: resend
Password: <RESEND_API_KEY>
```

### 2.3 Outbound email: Resend

1. Resend → Domains → Add Domain → `enescena.com.ar`, choosing a region.
2. Load the three records it returns into Cloudflare: the MX and TXT for `send`,
   and the TXT for `resend._domainkey`. All three go **DNS only** (TXT and MX are
   never proxied, but it's worth checking on the MX).
3. Wait for `verified` in the Resend panel.
4. Add the DMARC record at `p=none` to get reports before hardening.

The `rua` has to point at an address in the domain itself. A `rua` pointing at a
foreign domain — a Gmail mailbox, say — requires that domain to publish a
cross-authorization record (`enescena.com.ar._report._dmarc.gmail.com`), which
only Google could create; without it a good share of providers won't send the
reports. With `dmarc@enescena.com.ar` forwarded by Email Routing they reach Gmail
anyway and there's no external validation to solve.

The reports are compressed XML and several arrive per day. To read them without
tooling there are free digest services (Postmark, dmarcian) that give you an
address for the `rua` and send a readable summary.

### 2.4 Proxy and WAF over `sistema`

Only `sistema` is proxied. The landing (`@`, `www`) and the non-HTTP services
(`mysql`, `ssh`, `ftp`) stay DNS only: the landing lives on a DreamHost origin we
don't control — the Origin Cert can't be installed on it — and the proxy only
carries HTTP/HTTPS.

Origin certificate. The origin serves a valid Let's Encrypt certificate that
Traefik renews over ACME HTTP-01. In this stack **the decision was to stay on
Let's Encrypt**: Coolify manages and renews it natively, and renewal works behind
the proxy with no extra configuration. What must be avoided is Cloudflare
redirecting the `/.well-known/acme-challenge/` path to HTTPS before it reaches
the origin; verify it gets through:

```sh
curl -sSI http://sistema.enescena.com.ar/.well-known/acme-challenge/test
```

A `404` (answered by the origin) means the challenge gets through and renewal
will work. A `301` to HTTPS means "Always Use HTTPS" is redirecting the path:
create a Page Rule for `*sistema.enescena.com.ar/.well-known/acme-challenge/*`
with "Always Use HTTPS: Off". During rollout it returned `404`, so the rule
wasn't needed.

A **Cloudflare Origin Certificate** (SSL/TLS → Origin Server, 15 years, no ACME)
was evaluated and discarded. The app router Coolify generates carries
`certResolver: letsencrypt`, and adding the cert to Traefik's store
(`tls.certificates` in the Dynamic Configuration) does not disable that resolver
— Traefik keeps serving the Let's Encrypt one. Forcing the Origin Cert would
require editing the labels Coolify regenerates on every deploy, which is more
fragile than leaving the Let's Encrypt that already renews itself. The generated
Origin Cert was revoked in Cloudflare and the `tls.certificates` block and the
`.crt`/`.key` files were removed from the dynamic config; Full (strict) still
validates against the public Let's Encrypt certificate.

Steps:

1. SSL/TLS → **Full (strict)** mode.
2. Switch `sistema` to **Proxied** and verify the 302 → `/ingresar` with `cf-ray`
   in the headers.
3. Verify the ACME path (above); add the Page Rule only if it redirects.
4. Load the WAF and rate limiting rules (below).

Rules loaded in Security → WAF, scoped to the app's host:

- **Custom rule** (action **Block**) against scanners:

  ```
  (http.host eq "sistema.enescena.com.ar") and (
    starts_with(http.request.uri.path, "/.env") or
    starts_with(http.request.uri.path, "/.git") or
    starts_with(http.request.uri.path, "/wp-") or
    starts_with(http.request.uri.path, "/wordpress") or
    starts_with(http.request.uri.path, "/vendor") or
    starts_with(http.request.uri.path, "/cgi-bin") or
    http.request.uri.path eq "/xmlrpc.php" or
    http.request.uri.path eq "/phpinfo.php"
  )
  ```

- **Rate limiting rule** over the access routes:

  ```
  (http.host eq "sistema.enescena.com.ar") and (
    starts_with(http.request.uri.path, "/ingresar") or
    starts_with(http.request.uri.path, "/recuperar-acceso") or
    starts_with(http.request.uri.path, "/auth")
  )
  ```

  ~20 requests / 10 s per IP. On the Free plan the only action is **Block**
  (Managed Challenge is paid) and the window is fixed at 10 s; that's enough to
  stop brute force on the login. Cloudflare counts by the client's real IP, so
  the grouping problem of the Traefik middleware doesn't apply. The threshold is
  left generous because an entire academy can come out of a single IP (NAT).

Two considerations specific to this app:

- **Request size.** Music uploads allow up to 50 MB
  (`choreographyMusicMaxFileSizeBytes`) and travel as `multipart/form-data`
  through the app, not straight to external storage. The body limit on
  Cloudflare's Free and Pro plans is 100 MB, so it fits — but the margin is 2x.
  Raising the music limit above ~90 MB requires revisiting this first.
- **Serving bytes through the proxy.** Storage lives on a local volume of the VPS
  and is served through the app's `/almacenamiento` route. Cloudflare's
  self-serve terms discourage using the CDN to serve disproportionate volumes of
  non-HTML content (audio and video). At the current volume this shouldn't be a
  problem, but if a complaint ever arrives, the way out is exposing storage under
  a separate hostname on DNS only.

## 3. Hostinger

The VPS firewall is already default-deny with SSH restricted (#238). The step
that makes the WAF inescapable is accepting `443` only from Cloudflare's ranges:
while `443` is open to `0.0.0.0/0`, anyone can hit `72.60.59.2` directly with SNI
and bypass the WAF.

- **Remove**: the `Accept 443 from 0.0.0.0/0` rule.
- **Add**: one `Accept TCP 443` rule per range in
  `https://www.cloudflare.com/ips-v4` (15 IPv4 ranges).
- **Keep** `Accept 80 from 0.0.0.0/0`: the origin certificate is a Let's Encrypt
  one that Traefik renews over ACME HTTP-01 (section 2.4), and that challenge
  comes in over `80`. Closing it would break renewal. On top of that, with `443`
  closed, `80` gives no access to the app — everything redirects to HTTPS, which
  only enters through Cloudflare — so leaving it open adds no surface and saves
  15 rules.
- **Keep** the two SSH rules and the final `Drop`.

Watch out for:

- Do this **last**, after proxying `sistema` and verifying. Closing `443` to
  Cloudflare while `sistema` is still DNS only locks out your own access.
- Hit "Sincronizar" or the changes aren't applied.
- If the SSH source IP is dynamic and changes, the rule locks you out. That was
  already the case before this migration.

## 4. Coolify

### Environment variables

In the `en-escena` app → Environment Variables:

- `EMAIL_FROM="En Escena <acceso@enescena.com.ar>"`
- `RESEND_API_KEY=re_...`
- remove `EMAIL_PROVIDER` and `BREVO_API_KEY`

`getEmailProvider()` defaults to `resend`, so deleting `EMAIL_PROVIDER` leaves the
right provider with no further changes. Requires a redeploy.

`acceso@` is preferable to `no-reply@`: with Email Routing, replies from confused
users reach someone, and `no-reply` senders have worse reputation with filters.

### Traefik behind the proxy: left alone

The rate limit middleware proposed in #238 was conceived before Cloudflare was in
the picture. With the WAF and rate limiting running at Cloudflare's edge (section
2.4) and the firewall closed to Cloudflare's ranges (section 3), that middleware
is a redundant third line that adds little margin and costs configuration (app
labels + dynamic configuration). It is omitted.

If it is ever reintroduced, an error in #238's framing needs correcting: behind
the proxy, the source IP Traefik sees is Cloudflare's, so the middleware has to
group by `CF-Connecting-IP`
(`sourceCriterion.requestHeaderName: CF-Connecting-IP`) or it would punish all
traffic together. That header is only trustworthy with the origin closed to
Cloudflare.

`forwardedHeaders.trustedIPs` would only be needed if the app read the client IP
for logs or logic; today it doesn't (section 5), so that stays untouched too.

## 5. Code

Almost nothing:

- `.env.example` documents the sender and the default provider.
- No module reads the client IP (`X-Forwarded-For`, `CF-Connecting-IP` or
  equivalents), so the proxy forces no code changes.
- There is no rate limiting in the app; it lives only in Cloudflare. The Traefik
  middleware proposed in #238 was discarded (section 4).
- The Brevo to Resend switch requires no changes: `app/lib/shared/email.server.ts`
  already supports both and defaults to Resend.

## Verification

```sh
# Delegation
dig +short NS enescena.com.ar

# Outbound
dig +short TXT resend._domainkey.enescena.com.ar
dig +short TXT send.enescena.com.ar
dig +short MX send.enescena.com.ar

# Inbound
dig +short MX enescena.com.ar
dig +short TXT enescena.com.ar   # there must be exactly ONE SPF

# Policy
dig +short TXT _dmarc.enescena.com.ar
```

Then:

1. Trigger a real "recuperar acceso" against a Gmail mailbox and confirm in the
   message details that it says `signed-by: enescena.com.ar` and that DMARC
   passes.
2. Send a mail _to_ `acceso@enescena.com.ar` and confirm it reaches the Gmail
   mailbox.
3. Confirm the landing and `sistema` still respond.

## Rollback

Reverting the delegation in NIC.ar to `ns1/2/3.dreamhost.com` restores the
previous state as soon as it propagates. The old zone still exists on DreamHost —
the account belongs to a third party and we have no way to delete it — so
rollback is available indefinitely.

That same fact is the reason for the migration: without access to the account,
every DNS change depended on coordinating with whoever administers it. With the
zone on Cloudflare and the delegation under the registrant CUIT at NIC.ar,
changes become self-service. While the landing stays on DreamHost, the only thing
left in that account's hands is the WordPress hosting.
