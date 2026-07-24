# Why 1 Darjeeling

Product rationale and impact notes, grounded in the current codebase rather than in
pitch material. Every factual claim below cites the file it comes from, so this
document can be re-checked when the code changes.

Companion docs: **`memory/PRD.md`** (personas, journeys, feature inventory, data
model) and **`README.md`** (stack and layout). This file answers the *why*, not
the *what* or *how*.

---

## 1. What is 1 Darjeeling?

A **single directory and booking app for everything in the Darjeeling hills**,
running in four languages. The tagline in `frontend/src/locales/en.json` — "One
Darjeeling. Every experience." — is meant literally: seven categories, one place.

| Category | Interaction model |
| --- | --- |
| Homestays, Drivers | **Book online** — dates, guests, notes, payment, confirmation |
| Local shops, Cafes, Festivals | **Contact directly** — call, WhatsApp, directions, add-to-calendar |
| Tourism spots, Biodiversity | **Informational** — no booking, no owner |

The split is enforced in `frontend/src/pages/ListingDetail.tsx`:

```ts
const bookable    = item.type === 'homestay' || item.type === 'driver';
const contactable = ['shop', 'cafe', 'event'].includes(item.type);
```

Supporting capabilities:

- WhatsApp OTP login — no passwords (`backend/src/routes/auth`, `frontend/src/pages/Login.tsx`)
- Provider onboarding tailored per business type (homestay / driver / cafe / shop)
- Optional KYC → a **Verified** badge (`frontend/src/components/provider/dashboard/KycSection.tsx`)
- Reviews with photo attachments (`frontend/src/components/listing-detail/ReviewsSection.tsx`)
- Favourites plus a shareable trip plan (`frontend/src/pages/Saved.tsx`)
- Map location picker seeded with real hill landmarks — Chowrasta, Ghum, Batasia
  Loop, Takdah, Lamahatta, Mirik (`frontend/src/components/LocationPicker.tsx`)
- Mobile-first, installable as a PWA (`frontend/src/service-worker.ts`)

### Status caveat

The project is **pre-launch**. Payments run through a mock gateway alongside
Razorpay, OTP delivery is mocked, and the catalogue is seeded
(`backend/scripts/seed.ts`). The plumbing is real; the market is not on it yet.
Read every impact claim in section 4 as *intended*, not *measured*.

---

## 2. Why does it exist?

The project's own answer, from `about.mission_body` in the locale files:

> Visitors arrive in Darjeeling and end up booking through agents who have never
> walked these ridges. The homestay owner, the driver who knows every switchback,
> the shop weaving shawls upstairs, the cafe that has served the same breakfast
> since 1911 — they are hard to find online, and harder to book.
>
> We put them on one map. No middlemen deciding who gets seen, no commission
> quietly taken out of a family's earnings.

### The commission claim is backed by the code

This is the part worth verifying rather than trusting. `backend/src/config.ts`
defines exactly two amounts, both in paise:

```ts
export const AMOUNTS: Record<string, number> = {
  provider_registration: 9900,   // ₹99, one-time
  booking_commission:    100     // ₹1 flat, per booking
};
```

`booking_commission` is a misleading variable name — it is a **flat ₹1, not a
percentage**. There is no rate and no percentage arithmetic anywhere in
`backend/src/routes/payments.ts`. A ₹1,200 homestay night and a ₹5,000 one both
cost the provider ₹1.

At a typical OTA commission of 15–20%, that same ₹1,200 booking would lose
₹180–240. The provider keeps essentially all of it.

### The four stated pillars

From `about.pillars`:

1. **Local first** — every listing belongs to someone who lives and works here;
   providers write their own descriptions and set their own prices.
2. **The whole hill, one place** — stays, drivers, tea houses, cafes, festivals
   and wildlife in one app instead of a dozen sites and phone numbers.
3. **In your language** — the entire site works in English, Nepali, Hindi and
   Bengali.
4. **Honest pricing** — the price a provider sets is the price you see.

Pillar 4 only holds *because* of the fee structure above. With no commission,
there is nothing to inflate the displayed price to cover.

---

## 3. What do users expect?

Two groups with materially different expectations.

### Travellers

They expect a booking app to behave like one: search, real photos, real prices, a
confirmation that means something, a phone number that answers.

Currently met by the booking flow (which ends in a confirmation carrying the
host's number and a WhatsApp deep link), photo reviews, and offline-capable PWA
behaviour.

Two open gaps:

- **No live payment gateway is wired for production yet** — Razorpay exists
  alongside the mock flow, but the mock is what runs.
- **Search has no persistent entry point.** The header search box was removed in
  favour of the category rail; `/search?q=` is reachable only from the hero
  booking widget on the landing page. The `search.placeholder` locale key is now
  orphaned.

### Providers

A homestay owner in Lebong or a driver in Ghum expects something different: **low
risk and low literacy cost**. This is what the design actually optimises for.

| Friction removed | How |
| --- | --- |
| Passwords | WhatsApp OTP only |
| English requirement | Full Nepali / Hindi / Bengali interface |
| Commission maths | One flat ₹99, then ₹1 per booking |
| Upfront paperwork | KYC is **optional** — list and earn first; verification only buys a trust badge |
| Guessing what guests see | Onboarding is a live preview of the public listing page |

### Both

Both expect the language switch to actually work. This matters more here than on
a typical app: a half-translated interface tells a Nepali-speaking provider the
app was not built for them. The locale files carry ~595 keys across
`en` / `hi` / `bn` / `ne`, held in structural parity.

One deliberate design decision supports this: amenity and tag **values are stored
in canonical English and only their display is translated**
(`frontend/src/lib/optionLabel.ts`). A provider's own custom entry has no
translation key and passes through exactly as typed, so a custom amenity written
in Nepali renders in Nepali.

---

## 4. How does it affect people in Darjeeling day to day?

### Plausible upside

**Money that stays in the hills.** Not a slogan — a measurable difference in what
lands in a family's hands per booking, per the fee structure in section 2.

**Visibility without a gatekeeper.** Ranking is not sold. A driver who knows every
switchback appears next to one with an agency behind him.

**Work in the shoulder season.** The "Monsoon escapes" promotion
(`home.deals.monsoon`) targets exactly the months when hill tourism dies. A
homestay filling three extra monsoon nights a month is a materially different
household.

**Categories that do not usually monetise.** Cafes, shops and festivals get
discovery without needing a booking system — the shop weaving shawls upstairs
gets found, called, and walked into.

**Dignity of language.** A provider writes their own description in their own
language and it publishes as written.

### Honest limits

**₹99 is up front and returns are not guaranteed.** A real barrier if you are
unsure the app has users — and pre-launch, it does not.

**It assumes a smartphone and data.** Not universal in the hills, which is part of
why offline PWA support and WhatsApp-based contact matter.

**Verification can become a second gatekeeper.** KYC is optional today. If
travellers start filtering on the Verified badge, "optional" quietly becomes
mandatory for anyone who wants bookings — and documents are exactly the friction
the design otherwise avoids.

**Being findable cuts both ways.** Concentrating visitors on whatever surfaces
first is real pressure on a fragile ecosystem. Presumably why the Responsible
Tourism pledge is a permanent tab in the mobile nav (`frontend/src/components/BottomNav.tsx`)
rather than a footer link.

### Short version

For a traveller it is convenience. For a Darjeeling family it is the difference
between an agent taking a fifth of a night's earnings and a platform taking one
rupee — and being findable at all without knowing anyone.

Whether that lands depends entirely on getting travellers onto the platform,
which is a distribution problem the code cannot solve.
