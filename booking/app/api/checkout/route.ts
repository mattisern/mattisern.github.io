import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { booking } from "@/lib/config.ts";
import { findSlot, slotIsFree } from "@/lib/booking.ts";
import { createHold, deleteEvent, lostRace, setHoldStripeSession } from "@/lib/google.ts";
import { siteUrl, stripe } from "@/lib/stripe.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAKEN = "Sorry, that time was just taken. Please pick another.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const note = String(body.note ?? "").trim();

  if (!name || name.length > 100) return error("Please enter your name.");
  if (!EMAIL.test(email) || email.length > 200) return error("Please enter a valid email address.");
  if (note.length > 1000) return error("Please keep the note under 1000 characters.");
  const price = booking.prices.find((p) => p.currency === body.currency);
  if (!price) return error("Please choose a currency.");

  const slot = findSlot(String(body.start ?? ""));
  if (!slot) return error("That time isn't available any more. Please pick another.", 409);

  try {
    if (!(await slotIsFree(slot))) return error(TAKEN, 409);

    // Stripe needs at least 30 minutes; add a minute so we never land just under it.
    const expiresAt = new Date(Date.now() + (Math.max(booking.checkoutMinutes, 30) + 1) * 60_000);
    const hold = await createHold(slot, { name, email, note }, expiresAt);

    if (await lostRace(hold)) {
      await deleteEvent(hold.id);
      return error(TAKEN, 409);
    }

    try {
      const when = DateTime.fromJSDate(slot.start, { zone: booking.timezone }).toFormat("cccc d LLLL yyyy, HH:mm ZZZZ");
      const metadata = {
        holdEventId: hold.id,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        name,
        email,
      };
      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: price.currency,
              unit_amount: price.amount,
              product_data: { name: booking.session.name, description: when },
            },
          },
        ],
        metadata,
        payment_intent_data: { description: `${booking.session.name}, ${when}`, metadata },
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${siteUrl()}/book/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl()}/book?release=${encodeURIComponent(hold.id)}`,
      });
      await setHoldStripeSession(hold, session.id);
      return NextResponse.json({ url: session.url });
    } catch (e) {
      await deleteEvent(hold.id);
      throw e;
    }
  } catch (e) {
    console.error("[checkout]", e);
    return error("Something went wrong starting the payment. Please try again.", 500);
  }
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
