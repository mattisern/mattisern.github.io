import { DateTime } from "luxon";
import { booking } from "./config.ts";
import type { CalendarEvent } from "./google.ts";

/**
 * Email the site owner about a new booking. Google doesn't email an event's organiser, so
 * they'd otherwise only find out from their calendar. Best effort: a failed email is
 * logged and never fails the booking. Does nothing until RESEND_API_KEY is set.
 */
export async function notifyOwner(
  event: CalendarEvent,
  details: { title: string; name: string; email: string; paid?: string },
) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  const when = DateTime.fromISO(event.start.dateTime).setZone(booking.timezone).toFormat("cccc d LLLL, HH:mm");
  const lines = [
    `${details.title}`,
    `When: ${when} (${booking.timezone})`,
    `Who: ${details.name} <${details.email}>`,
    details.paid ? `Paid: ${details.paid}` : "Free booking",
    event.hangoutLink ? `Google Meet: ${event.hangoutLink}` : "",
    event.description ? `\n${event.description}` : "",
  ];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: booking.notifyFrom,
        to: booking.notifyEmail,
        reply_to: details.email,
        subject: `New booking: ${details.name}, ${when}`,
        text: lines.filter(Boolean).join("\n"),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) console.error(`[notify] Resend ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error("[notify] failed", e);
  }
}
