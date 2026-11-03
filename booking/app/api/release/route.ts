import { NextResponse } from "next/server";
import { bookingProps, deleteEvent, getEvent } from "@/lib/google.ts";
import { stripe } from "@/lib/stripe.ts";

// Called when a client backs out of Stripe Checkout, so the slot frees up straight away
// instead of after the checkout window expires.
export async function POST(req: Request) {
  const { holdId } = (await req.json().catch(() => ({}))) as { holdId?: string };
  if (!holdId) return NextResponse.json({ ok: true });

  try {
    const event = await getEvent(holdId);
    const props = event && bookingProps(event);
    if (!event || props?.status !== "hold") return NextResponse.json({ ok: true });

    if (props.stripeSession) {
      const session = await stripe().checkout.sessions.retrieve(props.stripeSession);
      if (session.status === "complete") return NextResponse.json({ ok: true });
      if (session.status === "open") await stripe().checkout.sessions.expire(session.id);
    }
    await deleteEvent(event.id);
  } catch (e) {
    console.error("[release]", e);
  }
  return NextResponse.json({ ok: true });
}
