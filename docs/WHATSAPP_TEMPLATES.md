# WhatsApp message templates  ready to submit

The four templates aangan needs, with their bodies written to match the code that fills
them. Create these in WhatsApp Manager or with the curl calls below, then put the approved names
into the `WHATSAPP_*_TEMPLATE` environment variables.

**Read this before editing any body text.** Meta fills `{{1}}`, `{{2}}`, … strictly by position,
and the adapter passes the variables in the order `backend/src/lib/notifications.ts` builds them.
Nothing checks that the two agree. Get the order wrong and the message sends successfully with
the values in the wrong slots  a host is told a booking is for "Asha" when Asha is the listing 
and no error appears anywhere. The tables below are the contract; if you reorder a body, reorder
the caller too.

Second reason not to improvise: **an approved template that you edit goes back for review.** Get
the copy right before you submit rather than after.


## Using Interakt (what production uses)

Production sends WhatsApp through **Interakt** (`MESSAGING_PROVIDER=interakt`); the login code
already goes out this way with the template `aagan_otp`. The three booking templates below are
created the same way. The curl calls further down are for the direct Meta Cloud API adapter and
are not needed with Interakt.

**1. Create each template in Interakt** (Templates → Create new template):

| Interakt field | Value |
|---|---|
| Template name | `aangan_booking_confirmed_guest`, `aangan_booking_confirmed_host`, `aangan_booking_cancelled_guest` |
| Category | **Utility** |
| Language | English |
| Header | none |
| Body | copy the **Body** block of that template below *exactly*, including blank lines |
| Variables | Interakt asks for a sample for each `{{n}}`: use the Example column |
| Footer | `aangan` |
| Buttons | none |

Submit all three. Utility templates are usually approved within a few hours; Meta may ask for
changes. **Do not reorder the `{{n}}` slots**: the server fills them strictly by position.

**2. Put the approved names in the VPS `.env`** (`/var/www/1darjeeling-in/.env`):

```
INTERAKT_BOOKING_CONFIRMED_GUEST_TEMPLATE=aangan_booking_confirmed_guest
INTERAKT_BOOKING_CONFIRMED_HOST_TEMPLATE=aangan_booking_confirmed_host
INTERAKT_BOOKING_CANCELLED_GUEST_TEMPLATE=aangan_booking_cancelled_guest
```

Leave `NOTIFY_BOOKINGS=false` for now and recreate the backend
(`docker compose -f docker-compose.in.yml up -d --force-recreate backend`).

**3. Send yourself one of each, before turning anything on:**

```
docker compose -f docker-compose.in.yml exec backend npm run notify:test -- +91XXXXXXXXXX booking_confirmed_guest
docker compose -f docker-compose.in.yml exec backend npm run notify:test -- +91XXXXXXXXXX booking_confirmed_host
docker compose -f docker-compose.in.yml exec backend npm run notify:test -- +91XXXXXXXXXX booking_cancelled_guest
```

Each sends the template with the example values from this file to your own number. Check that
every value lands in the right place. If Interakt rejects one, the command prints Interakt's
reason (usually a template name typo or a template that is still in review).

**4. Switch booking alerts on:** set `NOTIFY_BOOKINGS=true` and recreate the backend again. The
server refuses to start if any of the three names is missing, so a half-done setup cannot go live
silently. The boot log then says `whatsapp/sms: on`.

---

## 1. Login code  `one_darjeeling_login`

Category **AUTHENTICATION**. You do not write this body  Meta supplies "*{{1}}* is your
verification code." and you choose only the options around it.

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

Renders as:

> **482913** is your verification code. For your security, do not share this code.
> This code expires in 5 minutes.
> `[ Copy code ]`

`code_expiration_minutes: 5` matches `OTP_TTL_SECONDS=300`. Change one and change the other, or
the message promises a window the server does not honour.

Sets `WHATSAPP_OTP_TEMPLATE`.

---

## 2. Booking confirmed, to the guest  `booking_confirmed_guest`

Category **UTILITY**. Filled from `notifyBookingConfirmed()`.

| Slot | Variable | Example |
|---|---|---|
| `{{1}}` | `name`  the guest's own name | `Asha Rai` |
| `{{2}}` | `listing`  what they booked | `Peak View Homestay` |
| `{{3}}` | `stay`  dates, or `a date to be arranged` | `2026-09-01 to 2026-09-03` |
| `{{4}}` | `host`  host contact, or a fallback sentence | `Host: Tenzing Bhutia, +919876543210.` |

**Body**

```
Hello {{1}}, your booking at {{2}} is confirmed for {{3}}.

{{4}}

Show this message on arrival. You pay the host directly for your stay.
```

**Footer**

```
aangan
```

`{{4}}` is a whole sentence, not a name  it arrives as either `Host: <name>, <phone>.` or
`The host will contact you.` depending on whether the listing has a reachable owner. Give it its
own line and do not wrap it in punctuation of your own.

```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "booking_confirmed_guest",
    "language": "en",
    "category": "UTILITY",
    "components": [
      { "type": "BODY",
        "text": "Hello {{1}}, your booking at {{2}} is confirmed for {{3}}.\n\n{{4}}\n\nShow this message on arrival. You pay the host directly for your stay.",
        "example": { "body_text": [["Asha Rai", "Peak View Homestay", "2026-09-01 to 2026-09-03", "Host: Tenzing Bhutia, +919876543210."]] } },
      { "type": "FOOTER", "text": "aangan" }
    ]
  }'
```

Sets `WHATSAPP_BOOKING_CONFIRMED_GUEST_TEMPLATE`.

---

## 3. Booking confirmed, to the host  `booking_confirmed_host`

Category **UTILITY**. Note this one has **five** variables and a different order from the guest
message  the listing comes first, not the person.

| Slot | Variable | Example |
|---|---|---|
| `{{1}}` | `listing` | `Peak View Homestay` |
| `{{2}}` | `guest`  the guest's name | `Asha Rai` |
| `{{3}}` | `guest_phone` | `+919876543210` |
| `{{4}}` | `stay` | `2026-09-01 to 2026-09-03` |
| `{{5}}` | `guests`  how many people | `3` |

**Body**

```
New booking at {{1}}.

Guest: {{2}}
Phone: {{3}}
Dates: {{4}}
People: {{5}}

Please contact your guest to confirm arrival details.
```

**Footer**

```
aangan
```

```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "booking_confirmed_host",
    "language": "en",
    "category": "UTILITY",
    "components": [
      { "type": "BODY",
        "text": "New booking at {{1}}.\n\nGuest: {{2}}\nPhone: {{3}}\nDates: {{4}}\nPeople: {{5}}\n\nPlease contact your guest to confirm arrival details.",
        "example": { "body_text": [["Peak View Homestay", "Asha Rai", "+919876543210", "2026-09-01 to 2026-09-03", "3"]] } },
      { "type": "FOOTER", "text": "aangan" }
    ]
  }'
```

Sets `WHATSAPP_BOOKING_CONFIRMED_HOST_TEMPLATE`.

---

## 4. Booking cancelled, to the guest  `booking_cancelled_guest`

Category **UTILITY**. Filled from `notifyBookingCancelled()`, which is also what the
double-booking guard calls after cancelling a booking the guest has already paid for  the one
case where silence would be indefensible.

| Slot | Variable | Example |
|---|---|---|
| `{{1}}` | `name` | `Asha Rai` |
| `{{2}}` | `listing` | `Peak View Homestay` |
| `{{3}}` | `stay` | `2026-09-01 to 2026-09-03` |
| `{{4}}` | `refund`  a whole sentence about the money | `Your payment has been refunded and will reach your account in 5-7 working days.` |

**Body**

```
Hello {{1}}, your booking at {{2}} for {{3}} has been cancelled.

{{4}}

We are sorry for the disruption. You can find another place to stay in the aangan app.
```

**Footer**

```
aangan
```

`{{4}}` arrives as one of two full sentences depending on whether the refund actually went
through, so it needs its own line and no added punctuation  same as `{{4}}` in the guest
confirmation.

```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "booking_cancelled_guest",
    "language": "en",
    "category": "UTILITY",
    "components": [
      { "type": "BODY",
        "text": "Hello {{1}}, your booking at {{2}} for {{3}} has been cancelled.\n\n{{4}}\n\nWe are sorry for the disruption. You can find another place to stay in the aangan app.",
        "example": { "body_text": [["Asha Rai", "Peak View Homestay", "2026-09-01 to 2026-09-03", "Your payment has been refunded and will reach your account in 5-7 working days."]] } },
      { "type": "FOOTER", "text": "aangan" }
    ]
  }'
```

Sets `WHATSAPP_BOOKING_CANCELLED_GUEST_TEMPLATE`.

---

## Notes

**Categorise honestly.** These three are UTILITY: each follows a transaction the recipient
initiated. Submitting them as MARKETING would cost roughly seven times as much per message and
let recipients opt out of their own booking confirmations. Meta also recategorises templates it
judges wrongly filed, so mislabelling gains nothing.

**The `example` block is not optional.** Meta rejects a template with variables and no example
values, and the rejection reason does not always say so plainly.

**Dates arrive as the app stores them**  `2026-09-01`, not `1 September 2026`. Readable, if
unlovely. Making them prettier is a change to `formatStay()` in
`backend/src/lib/notifications.ts` and needs no template change, since it is the same `{{3}}`
either way. Worth doing at some point; not worth blocking on.

**Test with the free test number first.** It sends to five nominated recipients and needs no
approved template for Meta's own `hello_world`, so you can prove the plumbing works while these
are still in review.
