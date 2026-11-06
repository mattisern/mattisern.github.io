import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getOffering, offerings } from "@/lib/config.ts";
import { bookingProps, confirmBooking, deleteEvent, getEvent } from "@/lib/google.ts";
import { stripe } from "@/lib/stripe.ts";
import { clearAvailabilityCache } from "@/lib/booking.ts";
import { notifyOwner } from "@/lib/notify.ts";

export async function POST(req: Request) {
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      process.env.STRIPE_WEBHOOK_SECRET ?? "",
    );
  } catch (e) {
    console.error("[webhook] bad signature", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        // Card payments are paid now; bank-based methods settle later via async_payment_succeeded.
        if (event.data.object.payment_status !== "unpaid") await confirm(event.data.object);
        break;
      case "checkout.session.async_payment_succeeded":
        await confirm(event.data.object);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await releaseHold(event.data.object);
        break;
    }
  } catch (e) {
    // A 500 makes Stripe retry, which is what we want if Google had a hiccup.
    console.error(`[webhook] ${event.type} failed`, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function confirm(session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  if (!m.start || !m.email) return; // not a booking checkout
  // Checkouts started before offerings existed carry no offering; they were all conversations.
  const offering = getOffering(m.offering) ?? { id: "conversation", ...offerings.conversation };
  const { event, isNew } = await confirmBooking({
    holdEventId: m.holdEventId,
    slot: { start: new Date(m.start), end: new Date(m.end) },
    client: { name: m.name, email: m.email },
    title: offering.name,
    offering: offering.id,
    stripeSession: session.id,
  });
  console.log(`[webhook] booked ${m.start} for ${m.email} (event ${event.id})`);
  // Stripe can deliver an event twice; only the first confirmation sends the email.
  if (isNew) {
    const paid = session.amount_total != null ? `${session.amount_total / 100} ${session.currency?.toUpperCase()}` : undefined;
    await notifyOwner(event, { title: offering.name, name: m.name, email: m.email, paid });
  }
}

async function releaseHold(session: Stripe.Checkout.Session) {
  const id = session.metadata?.holdEventId;
  if (!id) return;
  const event = await getEvent(id);
  if (event && bookingProps(event)?.status === "hold") {
    await deleteEvent(id);
    clearAvailabilityCache();
  }
}
