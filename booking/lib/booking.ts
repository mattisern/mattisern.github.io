import { booking } from "./config.ts";
import { candidateSlots, freeSlots, type Interval } from "./slots.ts";
import { bookingProps, busyIntervals, deleteEvent, googleConfigured, listBookings } from "./google.ts";
import { stripe } from "./stripe.ts";

const rules = { ...booking, durationMinutes: booking.session.durationMinutes };

/** The schedule's slot that starts at `startIso`, if it's currently bookable by the rules. */
export function findSlot(startIso: string, now = new Date()): Interval | undefined {
  const start = new Date(startIso).getTime();
  return candidateSlots(now, rules).find((s) => s.start.getTime() === start);
}

/** Slots that are offered by the schedule and free in the calendar. */
export async function availableSlots(now = new Date()) {
  const slots = candidateSlots(now, rules);
  if (!slots.length) return [];
  if (!googleConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[booking] Google Calendar not configured — showing every slot as free (dev only).");
      return slots;
    }
    throw new Error("Google Calendar is not configured");
  }
  const pad = booking.bufferMinutes * 60_000;
  const from = new Date(slots[0].start.getTime() - pad);
  const to = new Date(slots.at(-1)!.end.getTime() + pad);
  await releaseStaleHolds(from, to, now);
  const busy = await busyIntervals(from, to, booking.extraBusyCalendarIds);
  return freeSlots(slots, busy, booking.bufferMinutes);
}

/** True if nothing in the calendar blocks this slot right now. */
export async function slotIsFree(slot: Interval) {
  const pad = booking.bufferMinutes * 60_000;
  const busy = await busyIntervals(
    new Date(slot.start.getTime() - pad),
    new Date(slot.end.getTime() + pad),
    booking.extraBusyCalendarIds,
  );
  return freeSlots([slot], busy, booking.bufferMinutes).length === 1;
}

/**
 * Safety net for when Stripe's "expired" webhook didn't arrive: delete holds whose
 * checkout window has passed, unless Stripe says the client actually paid.
 */
async function releaseStaleHolds(from: Date, to: Date, now: Date) {
  const grace = 5 * 60_000;
  const holds = (await listBookings(from, to)).filter((e) => {
    const p = bookingProps(e);
    return p?.status === "hold" && p.holdExpires && new Date(p.holdExpires).getTime() + grace < now.getTime();
  });
  await Promise.all(
    holds.map(async (e) => {
      const sessionId = bookingProps(e)!.stripeSession;
      if (sessionId) {
        const session = await stripe().checkout.sessions.retrieve(sessionId);
        if (session.status === "complete") return; // paid; the webhook will confirm it
      }
      await deleteEvent(e.id);
    }),
  );
}
