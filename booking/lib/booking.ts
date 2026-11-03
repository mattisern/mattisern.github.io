import { booking } from "./config.ts";
import { candidateSlots, freeSlots, type Interval } from "./slots.ts";
import { bookingProps, busyIntervals, deleteEvent, googleConfigured, listBookings } from "./google.ts";
import { stripe } from "./stripe.ts";

const rules = booking;

/**
 * The client's upcoming booking of this kind, if any. Free bookings are limited to one
 * per email address at a time, so a script can't fill the calendar with fake calls.
 */
export async function upcomingBooking(email: string, offering: string, now = new Date()) {
  const until = new Date(now.getTime() + (booking.bookingWindowDays + 1) * 86_400_000);
  const events = await listBookings(now, until);
  return events.find((e) => {
    const p = bookingProps(e);
    return p?.offering === offering && p.clientEmail.toLowerCase() === email.toLowerCase();
  });
}

/** The schedule's slot that starts at `startIso`, if it's currently bookable by the rules. */
export function findSlot(startIso: string, now = new Date()): Interval | undefined {
  const start = new Date(startIso).getTime();
  return candidateSlots(now, rules).find((s) => s.start.getTime() === start);
}

// Free slots are reused for a few seconds, so a burst of page loads (many visitors, or a
// page stuck reloading) can't use up the Google Calendar quota of 600 requests a minute.
// Bookings always re-check the calendar live (slotIsFree), so this can't cause double bookings.
const CACHE_MS = 15_000;
let cached: { at: number; slots: Interval[] } | undefined;

export function clearAvailabilityCache() {
  cached = undefined;
}

/** Slots that are offered by the schedule and free in the calendar. */
export async function availableSlots(now = new Date()) {
  if (cached && now.getTime() - cached.at < CACHE_MS) {
    return cached.slots.filter((s) => findSlot(s.start.toISOString(), now));
  }
  const slots = await fetchAvailableSlots(now);
  cached = { at: now.getTime(), slots };
  return slots;
}

async function fetchAvailableSlots(now: Date) {
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
