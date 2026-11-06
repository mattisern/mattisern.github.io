// Minimal Google Calendar client using a refresh token for the site owner's account.
// The calendar doubles as the booking database: every booking (pending or paid) is an
// event tagged with a private extended property, so busy-time checks see it automatically.

import type { Interval } from "./slots.ts";

const API = "https://www.googleapis.com/calendar/v3";
const TAG = "lightlyBooking";

export type BookingProps = {
  status: "hold" | "confirmed";
  clientName: string;
  clientEmail: string;
  holdExpires?: string;
  stripeSession?: string;
  offering?: string;
};

export type CalendarEvent = {
  id: string;
  status: string;
  created: string;
  summary?: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  hangoutLink?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

export function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

let token: { value: string; expires: number } | undefined;

async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return token.value;
}

class GoogleError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Google Calendar API ${status}: ${body}`);
    this.status = status;
  }
}

async function gcal<T>(path: string, init: { method?: string; query?: Record<string, string>; body?: unknown } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new GoogleError(res.status, await res.text());
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const eventsPath = (id = "") => `/calendars/${encodeURIComponent(calendarId())}/events${id ? `/${encodeURIComponent(id)}` : ""}`;

/** Busy time across the booking calendar and any extra calendars. */
export async function busyIntervals(timeMin: Date, timeMax: Date, extraCalendarIds: string[] = []): Promise<Interval[]> {
  const ids = [calendarId(), ...extraCalendarIds];
  const res = await gcal<{ calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
    "/freeBusy",
    { method: "POST", body: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: ids.map((id) => ({ id })) } },
  );
  return Object.entries(res.calendars).flatMap(([id, cal]) => {
    if (cal.errors?.length) throw new Error(`Can't read busy times for calendar ${id}: ${JSON.stringify(cal.errors)}`);
    return (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  });
}

export function bookingProps(event: CalendarEvent): BookingProps | undefined {
  const p = event.extendedProperties?.private;
  if (!p?.[TAG]) return undefined;
  return {
    status: p.status as BookingProps["status"],
    clientName: p.clientName,
    clientEmail: p.clientEmail,
    holdExpires: p.holdExpires || undefined,
    stripeSession: p.stripeSession || undefined,
    offering: p.offering || undefined,
  };
}

function privateProps(props: BookingProps) {
  return { private: { [TAG]: "1", ...props } };
}

/** Booking events (holds and confirmed) overlapping the given range. */
export async function listBookings(timeMin: Date, timeMax: Date) {
  const res = await gcal<{ items: CalendarEvent[] }>(eventsPath(), {
    query: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      privateExtendedProperty: `${TAG}=1`,
      singleEvents: "true",
      maxResults: "2500",
    },
  });
  return res.items.filter((e) => e.status !== "cancelled");
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  try {
    const event = await gcal<CalendarEvent>(eventsPath(id));
    return event.status === "cancelled" ? null : event;
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

export async function deleteEvent(id: string) {
  try {
    await gcal(eventsPath(id), { method: "DELETE", query: { sendUpdates: "none" } });
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

/**
 * Block the slot while the booking is completed (for paid bookings: while the client pays).
 * Shows in your calendar as a busy "Hold" event.
 */
export async function createHold(
  slot: Interval,
  client: { name: string; email: string; note: string },
  holdExpires: Date,
  opts: { offering: string; paid: boolean },
) {
  return gcal<CalendarEvent>(eventsPath(), {
    method: "POST",
    query: { sendUpdates: "none" },
    body: {
      summary: `Hold: ${client.name}${opts.paid ? " (awaiting payment)" : ""}`,
      description: client.note ? `Note from ${client.name}:\n${client.note}` : undefined,
      start: { dateTime: slot.start.toISOString() },
      end: { dateTime: slot.end.toISOString() },
      transparency: "opaque",
      extendedProperties: privateProps({
        status: "hold",
        clientName: client.name,
        clientEmail: client.email,
        holdExpires: holdExpires.toISOString(),
        offering: opts.offering,
      }),
    },
  });
}

export async function setHoldStripeSession(event: CalendarEvent, stripeSession: string) {
  const props = bookingProps(event)!;
  await gcal(eventsPath(event.id), {
    method: "PATCH",
    query: { sendUpdates: "none" },
    body: { extendedProperties: privateProps({ ...props, stripeSession }) },
  });
}

/**
 * True if another booking for an overlapping time was created before ours.
 * Two clients can pass the free/busy check at the same moment; the earlier hold wins.
 */
export async function lostRace(hold: CalendarEvent) {
  const others = await listBookings(new Date(hold.start.dateTime), new Date(hold.end.dateTime));
  return others.some(
    (e) => e.id !== hold.id && (e.created < hold.created || (e.created === hold.created && e.id < hold.id)),
  );
}

/**
 * Turn a hold into the real booking: add the client as a guest, attach a Google Meet,
 * and email the invite. Recreates the event if the hold has gone missing.
 */
export async function confirmBooking(opts: {
  holdEventId?: string;
  slot: Interval;
  client: { name: string; email: string };
  title: string;
  offering: string;
  stripeSession?: string;
}) {
  const existing = opts.holdEventId ? await getEvent(opts.holdEventId) : null;
  if (existing && bookingProps(existing)?.status === "confirmed") return { event: existing, isNew: false };
  // Google dedupes Meet creation on this id, so retries don't make a second Meet.
  const requestId = opts.stripeSession ?? existing?.id ?? crypto.randomUUID();

  const body = {
    summary: `${opts.title} (${opts.client.name})`,
    description: existing?.description,
    start: { dateTime: (existing?.start.dateTime ?? opts.slot.start.toISOString()) },
    end: { dateTime: (existing?.end.dateTime ?? opts.slot.end.toISOString()) },
    transparency: "opaque",
    attendees: [{ email: opts.client.email, displayName: opts.client.name }],
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    conferenceData: {
      createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } },
    },
    extendedProperties: privateProps({
      status: "confirmed",
      clientName: opts.client.name,
      clientEmail: opts.client.email,
      holdExpires: "",
      stripeSession: opts.stripeSession ?? "",
      offering: opts.offering,
    }),
  };
  const query = { conferenceDataVersion: "1", sendUpdates: "all" };

  const event = await (existing
    ? gcal<CalendarEvent>(eventsPath(existing.id), { method: "PATCH", query, body })
    : gcal<CalendarEvent>(eventsPath(), { method: "POST", query, body }));
  return { event, isNew: true };
}
