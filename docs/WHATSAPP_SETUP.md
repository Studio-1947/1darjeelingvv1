# WhatsApp Cloud API — registration and setup

How to get 1 Darjeeling sending login codes and booking messages over WhatsApp, talking to Meta
directly with no aggregator in between.

**Why this instead of SMS.** An SMS to an Indian number must come from a DLT-registered sender,
and that registration is a queue measured in weeks. WhatsApp is OTT rather than SMS, so DLT does
not apply to it at all. Meta also lets an *unverified* business send to 250 unique recipients per
rolling 24 hours — well above our volume — so there is no business-verification queue to clear
before launch either.

**What we give up.** Someone without WhatsApp on their number cannot receive a code, and there is
no fallback. The MSG91 SMS adapter stays in the tree, dormant, for the day that matters: do DLT
then, and switch with one environment variable.

---

## Two ways to send this: Meta direct, or Interakt

Both send the same WhatsApp messages against the same Meta-approved templates. The difference is
who holds the WhatsApp account.

| | **Meta direct** (`MESSAGING_PROVIDER=whatsapp`) | **Interakt** (`MESSAGING_PROVIDER=interakt`) |
|---|---|---|
| Setup | This whole document — app, number registration, two-step PIN, system-user token | Their console; you get an API key |
| Cost per message | Meta's rate | Meta's rate plus a margin, on a subscription |
| Templates | Created in WhatsApp Manager | Created in Meta, then synced into Interakt |
| Rate limits | The 250/24h unverified cap, then Meta's tiers | Also a per-minute API cap by plan |
| Parties involved | You and Meta | You, Interakt, and Meta |
| DLT | Not applicable — this is not SMS | Not applicable either |

**Interakt is the shortcut through §1–§6 of this document.** If you would rather not register a
number against the Cloud API yourself, sign up with Interakt, get the key, and set:

```
MESSAGING_PROVIDER=interakt
INTERAKT_API_KEY=<from their Developer Settings>
INTERAKT_OTP_TEMPLATE=one_darjeeling_login
INTERAKT_COUNTRY_CODE=+91
```

You still need §7 and §8 — the templates are Meta's either way, created against your Meta
business account and synced into Interakt.

Two things specific to Interakt, both of which cost an hour if nobody warns you:

- **The API key is already base64.** It goes after `Basic ` verbatim. Encoding it a second time
  is the usual first mistake and presents as a flat `401` with no other clue.
- **It wants the country code and subscriber number as separate fields**, unlike every other
  provider here. Numbers on `INTERAKT_COUNTRY_CODE` are split automatically. A number carrying a
  *different* country code is **refused** rather than guessed at — guessing where a country code
  ends does not fail loudly, it delivers a login code to a stranger abroad. If the app starts
  serving another country, that is the setting to change.

The rest of this document is the Meta-direct path.

---

## Before you start

**The phone number is a one-way decision.** A number registered to the Cloud API can no longer be
used in the normal WhatsApp or WhatsApp Business app — not on any phone, not ever, until you
deregister it. If the number is currently in use on WhatsApp you must delete that WhatsApp account
first. Use a number nobody on the team is chatting to guests from.

You will also need:

- A Meta account with a **Business portfolio** (business.facebook.com)
- A published **privacy policy URL** — `https://1darjeeling.in/privacy`, which already returns 200
- The number able to receive one SMS or voice call, once, during verification

---

## 1. Create the Meta app

1. Go to **developers.facebook.com → My Apps → Create App**.
2. Pick the use case **"Connect with customers through WhatsApp"**. Not "Other" — this one wires
   the WhatsApp product up for you.
3. Attach it to your business portfolio when asked.

## 2. Add WhatsApp and note the two IDs

In the app dashboard, open **WhatsApp → API Setup**. Meta creates a WhatsApp Business Account
(WABA) for you, and gives you a free test number straight away.

Write down:

- **WhatsApp Business Account ID** — needed to create templates
- **Phone number ID** — this is `WHATSAPP_PHONE_NUMBER_ID`, and it is *not* the phone number
  itself. It is a long numeric id shown next to the number.

The test number sends to at most five recipients you nominate, and it is the fastest way to prove
your plumbing works before the real number is through verification. Use it.

## 3. Add the real number

**WhatsApp Manager → Phone numbers → Add phone number.**

- Enter the number and choose a **display name**. This is what recipients see. Meta reviews it
  against its own naming rules, and a name that looks nothing like your business gets rejected —
  "1 Darjeeling" is fine.
- Verify by SMS or voice call.

**Display name approval and number verification are two different things.** Verification proves
you hold the number, and takes minutes. Display name approval is a Meta review, and until it
passes you cannot complete the next step.

## 4. Set a two-step verification PIN

**WhatsApp Manager → Phone numbers → your number → Settings → Two-step verification.** Choose a
six-digit PIN and store it somewhere you will still have it — you need it to register the number
now, and again if you ever move it.

## 5. Register the number for the Cloud API

Adding the number to your WABA does not make it usable by the API. That takes one more call:

```bash
curl -X POST "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/register" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"<YOUR_SIX_DIGIT_PIN>"}'
```

A `{"success": true}` back means the number is live on the Cloud API.

## 6. Get a permanent access token

**Do not ship the token from the API Setup page.** That one is temporary and expires in about 24
hours. It presents later as "login stopped working overnight" with nothing in the app having
changed, which is a genuinely annoying hour to lose. The adapter warns at boot if the token looks
like one of these, but the check is a heuristic, not a guarantee.

**business.facebook.com → Business settings → Users → System users → Add.**

1. Create a system user with the **Admin** role.
2. **Add assets** → assign both your app and your WhatsApp Business Account, with full control.
3. **Generate new token** → pick the app → select these scopes:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
4. Choose **never expires**. Copy it once — it is not shown again.

That token is `WHATSAPP_ACCESS_TOKEN`.

## 7. Create the login template

> All four template bodies, with their variable mappings and ready-to-run curl calls, are in
> **`docs/WHATSAPP_TEMPLATES.md`**. This section explains the login one; that file is what you
> actually paste.

Authentication templates are a fixed shape. **You cannot write your own body copy** — Meta
supplies "*{{1}}* is your verification code." and you only choose the options around it. That is
deliberate on their part and there is no way around it.

Either build it in **WhatsApp Manager → Message templates → Create template → Authentication**, or
post it:

```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "one_darjeeling_login",
    "language": "en",
    "category": "AUTHENTICATION",
    "components": [
      { "type": "BODY", "add_security_recommendation": true },
      { "type": "FOOTER", "code_expiration_minutes": 5 },
      { "type": "BUTTONS", "buttons": [{ "type": "OTP", "otp_type": "COPY_CODE" }] }
    ]
  }'
```

Notes on the choices above:

- **`COPY_CODE`, not `ONE_TAP`.** One-tap autofill needs your app's signing hash registered with
  Meta, and it would break the moment Play App Signing re-signs the bundle with a different key.
  Copy-code works everywhere with no coupling to the build.
- **`code_expiration_minutes: 5`** matches `OTP_TTL_SECONDS=300` in the backend. Keep the two in
  step, or the message promises a window the server does not honour.

Authentication templates are usually approved within minutes.

## 8. Create the three booking templates

These are **UTILITY**, not authentication, so you do write the copy — and the copy is already
written. **`docs/WHATSAPP_TEMPLATES.md` has all four templates ready to paste**, with bodies whose
placeholder order matches what the code actually sends, plus the curl call for each.

Do not improvise the bodies. Placeholders are positional, the adapter fills them in the order
`backend/src/lib/notifications.ts` builds them, and nothing at runtime checks the two agree — a
mismatch sends successfully with the values in the wrong slots and no error anywhere.
`backend/test/notificationVars.test.ts` pins that order, so if you change it a test tells you.

Create one each for:

| Template | Env var |
|---|---|
| Guest, booking confirmed | `WHATSAPP_BOOKING_CONFIRMED_GUEST_TEMPLATE` |
| Host, booking confirmed | `WHATSAPP_BOOKING_CONFIRMED_HOST_TEMPLATE` |
| Guest, booking cancelled | `WHATSAPP_BOOKING_CANCELLED_GUEST_TEMPLATE` |

Utility templates take longer to review than authentication ones. If they are not ready, ship with
`NOTIFY_BOOKINGS=false` — the backend refuses to boot with notifications on and templates missing,
which is the correct behaviour and not a bug to work around.

## 9. Configure and deploy

```bash
MESSAGING_PROVIDER=whatsapp
WHATSAPP_ACCESS_TOKEN=<system user token>
WHATSAPP_PHONE_NUMBER_ID=<numeric id, not the phone number>
WHATSAPP_OTP_TEMPLATE=one_darjeeling_login
WHATSAPP_TEMPLATE_LANGUAGE=en
WHATSAPP_API_VERSION=v21.0

# Only when NOTIFY_BOOKINGS=true
WHATSAPP_BOOKING_CONFIRMED_GUEST_TEMPLATE=...
WHATSAPP_BOOKING_CONFIRMED_HOST_TEMPLATE=...
WHATSAPP_BOOKING_CANCELLED_GUEST_TEMPLATE=...
```

**Deploy order, same hazard as before.** Put these on the host *before* switching
`MESSAGING_PROVIDER` off `mock`. The provider validates its own configuration at boot, so a
half-configured switch crash-loops the stack rather than failing at the first login.

Confirm the language code matches the template exactly. A template created as `en` and sent as
`en_US` fails with *"Template name does not exist in the translation"* — which reads like the
template is missing when it is only the locale that is wrong.

## 10. Prove it end to end

```bash
curl -X POST https://1darjeeling.in/api/auth/otp/send \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+91XXXXXXXXXX"}'
```

You want `{"sent":true,"channel":"whatsapp"}` **and** the message on the handset. `sent: true`
alone is not proof — the whole messaging layer exists so that "sent" is never recorded for
something Meta did not confirm, so trust it, but look at the phone the first time anyway.

---

## Things that will bite

**The 250/24h cap.** Unverified, you can start 250 business-initiated conversations per rolling 24
hours. Fine now; the day a festival weekend pushes past it, logins start failing. Business
verification lifts it to 1,000, then 10,000, then unlimited. Start verification before you need it,
not during the weekend you need it.

**Quality rating.** Recipients marking your messages as spam or blocking the number drops your
quality tier, and Meta throttles or pauses a number that falls far enough. Only send what a person
asked for. This app does, but it is worth knowing why that matters.

**Pin the API version.** `WHATSAPP_API_VERSION` exists because Meta ships breaking changes between
versions and deprecates old ones on a schedule. Set it deliberately, and move it deliberately.

**The reviewer still cannot receive anything.** Google's app reviewer has no Indian number and no
WhatsApp on it, so `REVIEW_PHONE` / `REVIEW_OTP` remains exactly as necessary as it was under SMS.
See `1-Darjeeling-Mobile-App/docs/PLAY_STORE.md` §1.

## Going back to SMS

The MSG91 adapter is untouched and still tested. If you need SMS — because of the 250 cap, or a
user without WhatsApp — complete DLT registration, set the `MSG91_*` variables, and switch
`MESSAGING_PROVIDER=msg91`. No code change.

A try-WhatsApp-then-fall-back-to-SMS composite provider would be a third adapter wrapping the
other two. Worth building when there is a real user it would have saved; not before.
