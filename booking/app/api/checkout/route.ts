import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { booking, getOffering } from "@/lib/config.ts";
import { clearAvailabilityCache, findSlot, slotIsFree, upcomingBooking } from "@/lib/booking.ts";
import { confirmBooking, createHold, deleteEvent, lostRace, setHoldStripeSession } from "@/lib/google.ts";
import { siteUrl, stripe } from "@/lib/stripe.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAKEN = "Sorry, that time was just taken. Please pick another.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const note = String(body.note ?? "").trim();

  const offering = getOffering(body.offering);
  if (!offering) return error("Unknown booking type.");
  // Hidden field that people never see; bots fill in every field they find.
  if (body.website) return error("Something went wrong. Please try again.");
  if (!name || name.length > 100) return error("Please enter your name.");
  if (!EMAIL.test(email) || email.length > 200) return error("Please enter a valid email address.");
  if (note.length > 1000) return error("Please keep the note under 1000 characters.");

  const paid = offering.prices.length > 0;
  const price = offering.prices.find((p) => p.currency === body.currency);
  if (paid && !price) return error("Please choose a currency.");

  const slot = findSlot(String(body.start ?? ""));
  if (!slot) return error("That time isn't available any more. Please pick another.", 409);

  const when = DateTime.fromJSDate(slot.start, { zone: booking.timezone }).toFormat("cccc d LLLL yyyy, HH:mm ZZZZ");

  try {
    if (!paid) {
      const existing = await upcomingBooking(email, offering.id);
      if (existing) {
        const at = DateTime.fromISO(existing.start.dateTime).setZone(booking.timezone).toFormat("cccc d LLLL, HH:mm ZZZZ");
        return error(`You already have one booked for ${at}. The invite is in your email.`, 409);
      }
    }

    if (!(await slotIsFree(slot))) return error(TAKEN, 409);

    // Paid: Stripe needs at least 30 minutes, plus a minute so we never land just under it.
    // Free: the hold only lives for the second it takes to confirm.
    const holdMinutes = paid ? Math.max(booking.checkoutMinutes, 30) + 1 : 5;
    const expiresAt = new Date(Date.now() + holdMinutes * 60_000);
    const hold = await createHold(slot, { name, email, note }, expiresAt, { offering: offering.id, paid });
    clearAvailabilityCache();

    if (await lostRace(hold)) {
      await deleteEvent(hold.id);
      return error(TAKEN, 409);
    }

    try {
      if (!paid) {
        await confirmBooking({
          holdEventId: hold.id,
          slot,
          client: { name, email },
          title: offering.name,
          offering: offering.id,
        });
        return NextResponse.json({ confirmed: { start: slot.start.toISOString(), email } });
      }

      const metadata = {
        holdEventId: hold.id,
        offering: offering.id,
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
              currency: price!.currency,
              unit_amount: price!.amount,
              product_data: { name: offering.name, description: when },
            },
          },
        ],
        metadata,
        payment_intent_data: { description: `${offering.name}, ${when}`, metadata },
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${siteUrl()}/book/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl()}${offering.path}?release=${encodeURIComponent(hold.id)}`,
      });
      await setHoldStripeSession(hold, session.id);
      return NextResponse.json({ url: session.url });
    } catch (e) {
      await deleteEvent(hold.id);
      throw e;
    }
  } catch (e) {
    console.error("[checkout]", e);
    return error(
      paid ? "Something went wrong starting the payment. Please try again." : "Something went wrong. Please try again.",
      500,
    );
  }
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
