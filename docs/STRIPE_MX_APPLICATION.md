# Mexican Stripe Application — Step-by-Step

Why this matters: until your **platform Stripe entity** is registered as
a Mexican business, you can't onboard Mexican Connect sellers, you can't
enable OXXO, and the escrow flow on the `escrow-payouts` branch can't be
turned on. This is the single biggest unblock for revenue.

**Time required**: 30–45 min to apply. 1–7 days for Stripe approval.
You can do this in parallel with everything else.

---

## What to have ready before you start

### Required documents (scan or photo each)

1. **Acta constitutiva** (incorporation deed) of your Mexican entity, OR
   if you're operating as **persona física con actividad empresarial**, your
   CURP + RFC certificate.
2. **Comprobante de domicilio fiscal** — utility bill (CFE, agua,
   gas) or bank statement at the registered address, dated within the
   last 3 months.
3. **Identificación oficial** — INE (front + back) or passport of the
   legal representative.
4. **Constancia de situación fiscal** — current RFC certificate from SAT.
   Download from https://sat.gob.mx (you need your e.firma or contraseña
   for CIEC).
5. **CLABE bancaria** of the Mexican business account where Stripe will
   deposit. Must be in the same legal name as the entity. Get this from
   your bank statement or app (18 digits, starts with the bank prefix).
6. **Estado de cuenta bancario** — most recent month's bank statement
   showing the account holder name + CLABE clearly.

> Tip: have all 6 PDFs in one folder named `stripe-mx-application/`
> before you start the form. Stripe asks for them mid-flow and you
> don't want to be hunting for files.

### Decisions to make before starting

- **Business name (razón social)** — must match the acta constitutiva
  exactly. Naranjogo's legal entity name, not the brand.
- **MCC code (giro)** — Stripe will suggest. The right one for you is
  **5734 — Computer Software Stores** OR **7372 — Software**. If a human
  reviewer asks "what does your business do?", say: *"Marketplace digital
  para servicios locales en México. Cobramos comisión por reservas
  pagadas en línea."*
- **Statement descriptor** — what appears on the buyer's credit card
  statement. Keep it short: `NARANJOGO` works.
- **Support email + phone** — visible to buyers if they dispute a
  charge. Use a monitored inbox, not your personal Gmail.

---

## Step 1 — Create the MX Stripe account

1. Open https://dashboard.stripe.com/register in an **incognito window**
   (so it doesn't reuse your existing US Stripe session).
2. Choose **México** as the country. **This is irreversible** — Stripe
   does not let you change country later. Triple-check.
3. Enter your business email (use a real monitored inbox).
4. Verify the email link.

## Step 2 — Activate the account (the long form)

After login, click **"Activar pagos"** (or "Activate payments"). The
form has 6 sections. Have all the documents from above open.

### Section 1 — Tipo de negocio (Business type)

- **Persona moral** (corporation, S.A. de C.V., S. de R.L.) — most
  common.
- **Persona física con actividad empresarial** — if you operate as an
  individual with SAT-registered business activity.
- **Negocio sin fines de lucro** — non-profit; rare.

Pick whichever matches your **acta constitutiva** or your RFC
registration.

### Section 2 — Información del negocio

- Razón social / Nombre legal — exactly as on the acta constitutiva.
- RFC — 12 chars (persona moral) or 13 chars (persona física). Stripe
  validates this against SAT.
- Domicilio fiscal — full street, número, colonia, CP, ciudad, estado.
  Must match the constancia.
- Teléfono del negocio — Mexican landline or cell phone in +52 format.
- Sitio web — https://naranjogo.com.mx (or whatever your prod domain
  is). **Required.** Stripe will visit this URL.

### Section 3 — Descripción del negocio

- Industria / Giro: **Mercado en línea / Marketplace**.
- Descripción (free text, 250 chars):

```
Naranjogo es un marketplace digital para servicios locales en San
Miguel de Allende (CP 37700). Los compradores reservan y pagan en
línea. Cobramos una comisión por reserva pagada. Los proveedores
verificados cobran sus servicios vía Stripe Connect.
```

- MCC code: **7372 — Software** (or whichever Stripe suggests).
- ¿Vende productos o servicios? **Servicios**.
- ¿Cuál es el tiempo promedio de entrega? **El mismo día o hasta 7
  días** (covers tailoring + booked services).

### Section 4 — Representante legal (KYC)

- Nombre completo, CURP, fecha de nacimiento, domicilio.
- Cargo: Director, Administrador único, Socio, etc.
- Upload INE (front + back) or passport.

### Section 5 — Cuenta bancaria

- CLABE (18 digits).
- Banco — Stripe auto-detects from the CLABE prefix.
- Titular: nombre de la persona moral / persona física — must match
  the entity name from Section 2.
- Upload **estado de cuenta** PDF.

### Section 6 — Documentos finales

- Upload acta constitutiva (or RFC constancia for persona física).
- Upload comprobante de domicilio.

Click **Enviar para revisión**.

---

## Step 3 — What Stripe does next

1. **Automated check (instant)** — verifies RFC vs SAT, CLABE vs banco,
   INE/CURP. If anything fails the page shows a yellow warning right
   away — fix and resubmit.
2. **Human review (1–7 days)** — Stripe MX team manually checks the
   acta + domicilio + descripción. They may email asking for:
   - A higher-resolution scan of a document.
   - A clarification of your business model (have the description above
     ready to paste in a reply).
   - A "supporting evidence" link — point them at any of your live
     listings on naranjogo.com.mx.
3. **Approval email** — your account is **active**. You'll see two new
   keys in Dashboard → Developers → API keys:
   - `pk_live_…`
   - `sk_live_…`

---

## Step 4 — Hand off the keys to your app

Once approved, you have two choices:

### Option A (recommended for first 30 days) — Keep both accounts

- Keep the US Stripe in dev/test for backwards compatibility while you
  fully validate the MX live keys.
- Use MX keys in Vercel **Preview** only. Confirm a full booking →
  payment → release loop. Then switch Production.

### Option B — Cut over immediately

- Replace `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in Vercel
  (Production + Preview) with the MX live keys.
- Also update `STRIPE_WEBHOOK_SECRET` after re-creating the webhook
  endpoint under your new MX account → Developers → Webhooks → Add.

Either way, the actual variables to update in Vercel are:

| Key | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` from MX account |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` from MX account |
| `STRIPE_WEBHOOK_SECRET` | from new MX webhook (Step 5 below) |

### Step 5 — Re-create the webhook endpoint

The webhook is account-bound, so when you move accounts you have to
re-register it:

1. In the new MX Dashboard → **Developers → Webhooks → Add endpoint**.
2. URL: `https://naranjogo.com.mx/api/webhooks/stripe`.
3. Events to send (subscribe):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `payment_intent.payment_failed`
   - `transfer.created`
   - `transfer.failed`
   - `transfer.reversed`
   - `charge.refunded`
4. Copy the **Signing secret** (starts with `whsec_…`) into the Vercel
   env `STRIPE_WEBHOOK_SECRET`.
5. Deploy. Test by triggering a small ($1 MXN) Checkout in Preview.

---

## Step 6 — Activate the escrow flow

Only **after** the MX account is fully approved and you've done one
end-to-end paid test booking with the new keys:

1. Run the migration from the `escrow-payouts` branch:
   `supabase/migrations/20260519180000_service_bookings_payout_escrow.sql`
2. Set Vercel env (Preview first, then Production):
   - `PAYOUTS_ESCROW_ENABLED=true`
   - `PAYOUTS_HOLD_HOURS=0` (or `48` if you want a dispute window)
   - `CRON_SECRET=<random 32-char token>` if hold > 0
3. (If hold > 0) add to `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/cron/release-payouts", "schedule": "*/15 * * * *" }] }
   ```
4. Merge `escrow-payouts` → `main`.

Full smoke-test instructions are in `docs/ESCROW_PAYOUTS.md`.

---

## Common rejection causes & how to avoid them

| Cause | How to avoid |
|---|---|
| RFC doesn't match SAT records | Pull the constancia from SAT same-day, paste exactly. |
| CLABE titular ≠ razón social | Open a bank account in the entity's exact legal name **before** applying. |
| "Negocio no claro" | Use the description text from Section 3 verbatim. Always reply with "marketplace digital de servicios locales." |
| Acta scan too low resolution | Scan at 300 DPI minimum. Photos with phone are fine if well lit. |
| Domicilio fiscal mismatch | Domicilio on RFC must equal domicilio on comprobante. If you moved, update SAT first (`Cambio de domicilio fiscal`) — takes 24h. |

---

## What to do while you wait for approval

1. Keep recruiting tailors (`docs/RECRUITMENT_KIT.md`). Approval-week is
   the perfect time to line up 3–5 verified tailors so the day MX
   Stripe lights up, you have real bookings ready.
2. **Don't enable OXXO yet** even if Stripe asks during onboarding — turn
   that on only after the first card payment works.
3. Test the existing **US Stripe** flow once more on Preview to make
   sure nothing is broken before the cutover.

---

## When you get rejected

It happens. Stripe MX is conservative for marketplaces. If the rejection
email says:

- **"Necesitamos más información sobre tu modelo de negocio"** — reply
  with the Section 3 description + 2 screenshots: (1) a live listing,
  (2) the `/arreglos-de-ropa` landing page. Mention you serve CP 37700
  exclusively at first.
- **"Modelo de negocio no soportado"** — request a manual review with
  the same evidence. Most marketplaces eventually get through; it just
  takes one more round of clarification.
- **"Documentos no válidos"** — they'll specify which one. Re-upload
  higher resolution and resubmit. No penalty for resubmitting.

Ping me with the exact rejection text and we'll respond to Stripe
together.
