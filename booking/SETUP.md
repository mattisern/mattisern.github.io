# Booking setup

This folder is the booking app behind **book.lightly.io**. The rest of the repo is lightly.io itself, still served by GitHub Pages, which skips this folder (see `_config.yml`). Netlify deploys only this folder (see `netlify.toml` at the repo root).

Clients pick a time on `/book` and pay with Stripe Checkout. Then a Google Calendar event with a Meet link is created and the invite goes to them by email.

There's no database. Your Google Calendar holds the bookings:

1. **Client clicks "Continue to payment".** A busy event, `Hold: <name> (awaiting payment)`, goes into your calendar so nobody else can take the slot.
2. **Payment succeeds.** Stripe's webhook turns the hold into `1-on-1 with Mattis (<name>)`. The event gets a Google Meet link, the client is added as a guest, and Google emails them the invite.
3. **Client backs out, or doesn't pay within ~30 minutes.** The hold is deleted and the slot opens again.

## On lightly.io

The front page (`index.html`, under "Start your path") shows the booking flow right on the page. It uses `<div id="book" data-lightly-booking="exploration conversation">` plus `<script src="https://book.lightly.io/embed.js" defer>`. Listing two offerings gives a switch between them; the first one listed is selected to begin with. The script is `public/embed.js`, and its styles are in the site's `booking.css`. Paid bookings return to the same page after Stripe. Only origins listed in `returnOrigins` in `lib/config.ts` are allowed as return pages. The standalone pages `/book` and `/explore` on book.lightly.io still work too.

Run every command below from this `booking/` folder.

## Schedule and prices

Edit `lib/config.ts`. Push to the default branch and Netlify redeploys.

- `offerings`: what can be booked, each with its own page:
  - `/book`: the paid conversation, priced in EUR, USD and SEK.
  - `/explore`: the free exploration call. Free bookings skip Stripe and confirm at once. Each email address can only have one upcoming exploration call.
- `booking`: the length, timezone, weekly start times, notice period and buffer. These are shared by both offerings, so a time can only be booked once.

## Local development

`.env.local` (not committed) holds the keys. `.env.example` lists them.

1. Start the site:

   ```bash
   npm run dev
   ```

2. In a second terminal, forward Stripe test webhooks. This uses the key from `.env.local`, so it always listens to the same sandbox the site charges:

   ```bash
   stripe listen --api-key "$(grep '^STRIPE_SECRET_KEY=' .env.local | cut -d= -f2-)" --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:3000/api/stripe/webhook
   ```

   The `whsec_...` it prints goes in `STRIPE_WEBHOOK_SECRET`.

3. Book at <http://localhost:3000/book> with test card `4242 4242 4242 4242`.

To reconnect Google (for example after changing account), run `npm run google-auth`. It writes a new `GOOGLE_REFRESH_TOKEN` into `.env.local`. The Google Cloud app must stay **In production** (<https://console.cloud.google.com/auth/audience>); in "Testing" the token expires after 7 days.

## Hosting (Netlify)

- **Site:** Netlify project linked to `mattisern/mattisern.github.io`. Build settings come from `netlify.toml`.
- **Environment variables:** `SITE_URL=https://book.lightly.io`, the four `GOOGLE_*` values, and the **live** `STRIPE_SECRET_KEY`. `STRIPE_WEBHOOK_SECRET` comes from the live Stripe webhook endpoint `https://book.lightly.io/api/stripe/webhook`. That endpoint listens for the same four `checkout.session.*` events as above.
- **DNS:** a `book` CNAME record at Namecheap points to Netlify. The other records serve lightly.io from GitHub Pages; leave them alone.

## Good to know

- **You don't get an invite email.** You're the organiser, so the booking simply appears in your calendar. Stripe emails you about each payment.
- **Cancelling or rescheduling** is manual. Move or delete the event in Google Calendar (Google notifies the client), and refund in Stripe if needed.
- **Holds still around after 30 min?** The next visit to `/book` cleans them up even if Stripe's webhook was missed.
