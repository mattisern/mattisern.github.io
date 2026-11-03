// Everything about what can be booked lives here. Edit and redeploy to change it.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const booking = {
  // The session clients are paying for.
  session: {
    name: "Conversation with Mattis",
    description: "A 40-minute video conversation on Google Meet.",
    durationMinutes: 40,
  },

  // Prices clients can choose between, in the smallest currency unit (cents / öre).
  // 15000 = 150.00. Visitors on Swedish time default to SEK, on American time to USD,
  // everyone else to the first one.
  prices: [
    { currency: "eur", amount: 15000 },
    { currency: "usd", amount: 15000 },
    { currency: "sek", amount: 150000 },
  ],

  // Your timezone. The weekly schedule below is in this timezone;
  // clients see times converted to their own.
  timezone: "Europe/Stockholm",

  // Start times you offer each week (24h, in `timezone`). Leave a day empty to close it.
  weekly: {
    mon: ["11:00", "17:00"],
    tue: ["11:00", "17:00"],
    wed: ["11:00", "17:00"],
    thu: ["11:00", "17:00"],
    fri: ["11:00", "17:00"],
    sat: ["07:00"],
    sun: [],
  } satisfies Record<Weekday, string[]>,

  // How soon a slot can be booked, and how far ahead.
  minNoticeHours: 48,
  bookingWindowDays: 28,

  // Keep this much free time around every session. A slot is hidden if anything
  // in your calendar is closer than this.
  bufferMinutes: 0,

  // Extra Google calendars to treat as busy (the booking calendar is always checked).
  // Use calendar IDs, e.g. "you@gmail.com" or "abc123@group.calendar.google.com".
  extraBusyCalendarIds: [] as string[],

  // How long a client has to finish paying before the slot is released (Stripe minimum is 30).
  checkoutMinutes: 30,
};
