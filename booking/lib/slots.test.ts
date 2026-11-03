import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateSlots, freeSlots } from "./slots.ts";

const rules = {
  timezone: "Europe/Stockholm",
  weekly: { mon: ["10:00", "14:00"], tue: [], wed: [], thu: ["09:30"], fri: [], sat: [], sun: ["02:30"] },
  durationMinutes: 60,
  minNoticeHours: 24,
  bookingWindowDays: 7,
};

test("builds slots from the weekly schedule in the owner's timezone", () => {
  // Saturday 2026-11-07 12:00 UTC (13:00 in Stockholm, CET).
  const slots = candidateSlots(new Date("2026-11-07T12:00:00Z"), rules);
  assert.deepEqual(
    slots.map((s) => s.start.toISOString()),
    [
      // Sun 8 Nov 02:30 is less than 24h away, and Sun 15 Nov is past the 7-day window.
      "2026-11-09T09:00:00.000Z", // Mon 10:00 CET
      "2026-11-09T13:00:00.000Z", // Mon 14:00 CET
      "2026-11-12T08:30:00.000Z", // Thu 09:30 CET
    ],
  );
  assert.equal(slots[0].end.toISOString(), "2026-11-09T10:00:00.000Z");
});

test("respects minimum notice", () => {
  // Sunday 2026-11-08 09:30 UTC: Monday 10:00 CET (09:00 UTC) is 23.5h away, so it's out.
  const slots = candidateSlots(new Date("2026-11-08T09:30:00Z"), rules);
  assert.equal(slots[0].start.toISOString(), "2026-11-09T13:00:00.000Z");
});

test("follows daylight saving time", () => {
  // Summer: Monday 2026-06-15 10:00 CEST is 08:00 UTC.
  const slots = candidateSlots(new Date("2026-06-12T12:00:00Z"), rules);
  assert.equal(slots.find((s) => s.start.getUTCDay() === 1)?.start.toISOString(), "2026-06-15T08:00:00.000Z");
});

test("skips times that don't exist when clocks spring forward", () => {
  // Sunday 2027-03-28 02:30 doesn't exist in Stockholm.
  const slots = candidateSlots(new Date("2027-03-24T12:00:00Z"), rules);
  assert.ok(!slots.some((s) => s.start.toISOString().startsWith("2027-03-28")));
});

test("hides slots that overlap busy time, with buffer", () => {
  const slot = (iso: string) => ({ start: new Date(iso), end: new Date(new Date(iso).getTime() + 3_600_000) });
  const slots = [slot("2026-11-09T09:00:00Z"), slot("2026-11-09T13:00:00Z"), slot("2026-11-09T15:00:00Z")];
  const busy = [{ start: new Date("2026-11-09T09:30:00Z"), end: new Date("2026-11-09T09:45:00Z") }, { start: new Date("2026-11-09T14:00:00Z"), end: new Date("2026-11-09T14:30:00Z") }];

  // Back-to-back (ends exactly when the 14:00 busy block starts) is fine without a buffer.
  assert.deepEqual(freeSlots(slots, busy).map((s) => s.start.toISOString()), ["2026-11-09T13:00:00.000Z", "2026-11-09T15:00:00.000Z"]);
  // A 15-minute buffer rules out the 13:00 slot, which ends right as the 14:00 block starts.
  assert.deepEqual(freeSlots(slots, busy, 15).map((s) => s.start.toISOString()), ["2026-11-09T15:00:00.000Z"]);
});
