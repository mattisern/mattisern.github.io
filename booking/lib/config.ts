// Everything about what can be booked lives here. Edit and redeploy to change it.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type Price = { currency: string; amount: number };

export type Offering = {
  // Booking page path on book.lightly.io.
  path: string;
  // Short name for the switch when one widget offers several kinds of booking.
  label: string;
  // Shown on the booking page, the Stripe receipt and the calendar invite.
  name: string;
  heading: string;
  description: string;
  // Label for the optional note field.
  notePrompt: string;
  // Prices clients can choose between, in the smallest currency unit (cents / öre):
  // 15000 = 150.00. With several, visitors on Swedish time default to SEK, on American
  // time to USD, everyone else to the first one. No prices = free, booked without payment.
  prices: Price[];
  // Shown instead of the price in the booking widget, e.g. "Free exploration call".
  priceLabel?: string;
};

// What clients can book. Both share the schedule and calendar below, so a time can
// only be taken once, by either.
export const offerings = {
  conversation: {
    path: "/book",
    label: "For individuals",
    name: "1-on-1 with Mattis",
    heading: "Book a 1-on-1",
    description: "A 40-minute 1-on-1 video call on Google Meet.",
    notePrompt: "Anything you'd like me to know?",
    prices: [{ currency: "usd", amount: 15000 }],
  },
  exploration: {
    path: "/explore",
    label: "For teams",
    name: "Exploration call with Mattis",
    heading: "Book an exploration call",
    description:
      "A free 40-minute video call on Google Meet, where we explore what your team needs and how we can work together.",
    notePrompt: "What would you like to explore?",
    prices: [],
    priceLabel: "Free exploration call",
  },
} satisfies Record<string, Offering>;

export type OfferingId = keyof typeof offerings;

// Pages that embed the booking widget and may receive clients back after payment.
// book.lightly.io itself (SITE_URL) is always allowed.
export const returnOrigins = ["https://lightly.io", "https://www.lightly.io", "http://localhost:4000"];

export function getOffering(id: unknown): (Offering & { id: OfferingId }) | undefined {
  return typeof id === "string" && Object.hasOwn(offerings, id)
    ? { id: id as OfferingId, ...offerings[id as OfferingId] }
    : undefined;
}

export const booking = {
  durationMinutes: 40,

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
